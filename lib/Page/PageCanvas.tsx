import { computed, defineComponent, inject, ref } from 'vue';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';
import * as pdfjs from 'pdfjs-dist';

import { PageContext } from '../PageContext';

import {
	cancelRunningTask,
	getDevicePixelRatio,
	isCancelException,
	makePageCallback,
} from '../shared/utils';

import type { RenderParameters } from 'pdfjs-dist/types/src/display/api';

const ANNOTATION_MODE = pdfjs.AnnotationMode;

type PageCanvasProps = {};

export const PageCanvas = defineComponent<PageCanvasProps>((props) => {
	const context = inject(PageContext, null);

	invariant(context, 'Unable to find Page context.');

	const mergedProps = { ...context, ...props };
	const {
		canvasBackground,
		devicePixelRatio: devicePixelRatioProps,
		onRenderError: onRenderErrorProps,
		onRenderSuccess: onRenderSuccessProps,
		page,
		renderForms,
		rotate,
		scale,
	} = mergedProps;

	const canvasElement = ref<HTMLCanvasElement | null>(null);

	invariant(
		page,
		'Attempted to render page canvas, but no page was specified.',
	);

	const devicePixelRatio = devicePixelRatioProps || getDevicePixelRatio();

	/**
	 * Called when a page is rendered successfully.
	 */
	function onRenderSuccess() {
		if (!page) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		if (onRenderSuccessProps) {
			onRenderSuccessProps(makePageCallback(page, scale));
		}
	}

	/**
	 * Called when a page fails to render.
	 */
	function onRenderError(error: Error) {
		if (isCancelException(error)) {
			return;
		}

		warning(false, error.toString());

		if (onRenderErrorProps) {
			onRenderErrorProps(error);
		}
	}

	const renderViewport = computed(() =>
		page.getViewport({ scale: scale * devicePixelRatio, rotation: rotate }),
	);

	const viewport = computed(() =>
		page.getViewport({ scale, rotation: rotate }),
	);

	function drawPageOnCanvas() {
		if (!page) {
			return;
		}

		// Ensures the canvas will be re-rendered from scratch. Otherwise all form data will stay.
		page.cleanup();

		const { value: canvas } = canvasElement;

		if (!canvas) {
			return;
		}

		canvas.width = renderViewport.value.width;
		canvas.height = renderViewport.value.height;

		canvas.style.width = `${Math.floor(viewport.value.width)}px`;
		canvas.style.height = `${Math.floor(viewport.value.height)}px`;
		canvas.style.visibility = 'hidden';

		const renderContext: RenderParameters = {
			annotationMode: renderForms
				? ANNOTATION_MODE.ENABLE_FORMS
				: ANNOTATION_MODE.ENABLE,
			canvasContext: canvas.getContext('2d', {
				alpha: false,
			}) as CanvasRenderingContext2D,
			viewport: renderViewport.value,
		};
		if (canvasBackground) {
			renderContext.background = canvasBackground;
		}

		const cancellable = page.render(renderContext);
		const runningTask = cancellable;

		cancellable.promise
			.then(() => {
				canvas.style.visibility = '';

				onRenderSuccess();
			})
			.catch(onRenderError);

		return () => cancelRunningTask(runningTask);
	}

	useEffect(
		drawPageOnCanvas,
		// Ommitted callbacks so they are not called every time they change
		[
			canvasBackground,
			canvasElement,
			devicePixelRatio,
			page,
			renderForms,
			renderViewport,
			viewport,
		],
	);

	const cleanup = () => {
		const { value: canvas } = canvasElement;

		/**
		 * Zeroing the width and height cause most browsers to release graphics
		 * resources immediately, which can greatly reduce memory consumption.
		 */
		if (canvas) {
			canvas.width = 0;
			canvas.height = 0;
		}
	};

	useEffect(() => cleanup, [cleanup]);

	return () => (
		<canvas
			class="react-pdf__Page__canvas"
			dir="ltr"
			ref={canvasElement}
			style={{
				display: 'block',
				userSelect: 'none',
			}}
		/>
	);
});
