import { computed, defineComponent, inject, ref } from 'vue';
import makeCancellable from 'make-cancellable-promise';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';
import * as pdfjs from 'pdfjs-dist';

import './TextLayer.css';

import { PageContext } from '../PageContext';

import { useResolver } from '../shared/hooks';
import { cancelRunningTask } from '../shared/utils';

import type {
	TextContent,
	TextItem,
	TextMarkedContent,
} from 'pdfjs-dist/types/src/display/api';

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
	return 'str' in item;
}

export const TextLayer = defineComponent(() => {
	const context = inject(PageContext, null);

	invariant(context, 'Unable to find Page context.');

	const {
		customTextRenderer,
		onGetTextError,
		onGetTextSuccess,
		onRenderTextLayerError,
		onRenderTextLayerSuccess,
		page,
		pageIndex,
		pageNumber,
		rotate,
		scale,
	} = context;

	const [textContentState, textContentDispatch] = useResolver<TextContent>();
	const { value: textContent, error: textContentError } = textContentState;
	const layerElement = ref<HTMLDivElement | null>(null);
	const endElement = ref<HTMLElement | null>(null);

	invariant(
		page,
		'Attempted to load page text content, but no page was specified.',
	);

	warning(
		parseInt(
			window
				.getComputedStyle(document.body)
				.getPropertyValue('--react-pdf-text-layer'),
			10,
		) === 1,
		'TextLayer styles not found. Read more: https://github.com/wojtekmaj/react-pdf#support-for-text-layer',
	);

	/**
	 * Called when a page text content is read successfully
	 */
	function onLoadSuccess() {
		if (!textContent) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		if (onGetTextSuccess) {
			onGetTextSuccess(textContent);
		}
	}

	/**
	 * Called when a page text content failed to read successfully
	 */
	function onLoadError() {
		if (!textContentError) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		warning(false, textContentError.toString());

		if (onGetTextError) {
			onGetTextError(textContentError);
		}
	}

	function resetTextContent() {
		textContentDispatch({ type: 'RESET' });
	}

	useEffect(resetTextContent, [page, textContentDispatch]);

	function loadTextContent() {
		if (!page) {
			return;
		}

		const cancellable = makeCancellable(page.getTextContent());
		const runningTask = cancellable;

		cancellable.promise
			.then((nextTextContent) => {
				textContentDispatch({ type: 'RESOLVE', value: nextTextContent });
			})
			.catch((error) => {
				textContentDispatch({ type: 'REJECT', error });
			});

		return () => cancelRunningTask(runningTask);
	}

	useEffect(loadTextContent, [page, textContentDispatch]);

	useEffect(
		() => {
			if (textContent === undefined) {
				return;
			}

			if (textContent === false) {
				onLoadError();
				return;
			}

			onLoadSuccess();
		},
		// Ommitted callbacks so they are not called every time they change
		[textContent],
	);

	/**
	 * Called when a text layer is rendered successfully
	 */
	const onRenderSuccess = useCallback(() => {
		if (onRenderTextLayerSuccess) {
			onRenderTextLayerSuccess();
		}
	}, [onRenderTextLayerSuccess]);

	/**
	 * Called when a text layer failed to render successfully
	 */
	const onRenderError = useCallback(
		(error: Error) => {
			warning(false, error.toString());

			if (onRenderTextLayerError) {
				onRenderTextLayerError(error);
			}
		},
		[onRenderTextLayerError],
	);

	function onMouseDown() {
		const end = endElement.value;

		if (!end) {
			return;
		}

		end.classList.add('active');
	}

	function onMouseUp() {
		const end = endElement.value;

		if (!end) {
			return;
		}

		end.classList.remove('active');
	}

	const viewport = computed(() =>
		page.getViewport({ scale, rotation: rotate }),
	);

	function renderTextLayer() {
		if (!page || !textContent) {
			return;
		}

		const { value: layer } = layerElement;

		if (!layer) {
			return;
		}

		layer.innerHTML = '';

		const textContentSource = page.streamTextContent();

		const parameters = {
			container: layer,
			textContentSource,
			viewport: viewport.value,
		};

		const cancellable = pdfjs.renderTextLayer(parameters);
		const runningTask = cancellable;

		cancellable.promise
			.then(() => {
				const end = document.createElement('div');
				end.className = 'endOfContent';
				layer.append(end);
				endElement.value = end;

				if (customTextRenderer) {
					let index = 0;
					textContent.items.forEach((item, itemIndex) => {
						if (!isTextItem(item)) {
							return;
						}

						const child = layer.children[index];

						if (!child) {
							return;
						}

						const content = customTextRenderer({
							pageIndex,
							pageNumber,
							itemIndex,
							...item,
						});

						child.innerHTML = content;
						index += item.str && item.hasEOL ? 2 : 1;
					});
				}

				// Intentional immediate callback
				onRenderSuccess();
			})
			.catch(onRenderError);

		return () => cancelRunningTask(runningTask);
	}

	useLayoutEffect(renderTextLayer, [
		customTextRenderer,
		onRenderError,
		onRenderSuccess,
		page,
		pageIndex,
		pageNumber,
		textContent,
		viewport,
	]);

	return () => (
		<div
			class="react-pdf__Page__textContent textLayer"
			onMouseUp={onMouseUp}
			onMouseDown={onMouseDown}
			ref={layerElement}
		/>
	);
});
