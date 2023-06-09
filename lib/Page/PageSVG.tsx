import { computed, defineComponent, inject } from 'vue';
import makeCancellable from 'make-cancellable-promise';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';
import * as pdfjs from 'pdfjs-dist';

import { PageContext } from '../PageContext';

import { useResolver } from '../shared/hooks';
import {
	cancelRunningTask,
	isCancelException,
	makePageCallback,
} from '../shared/utils';

import type { PageViewport } from 'pdfjs-dist';
import type { PDFOperatorList } from 'pdfjs-dist/types/src/display/api';

type SVGGraphics = {
	getSVG: (
		operatorList: PDFOperatorList,
		viewport: PageViewport,
	) => Promise<SVGElement>;
};

export const PageSVG = defineComponent(() => {
	const context = inject(PageContext, null);

	invariant(context, 'Unable to find Page context.');

	const {
		onRenderSuccess: onRenderSuccessProps,
		onRenderError: onRenderErrorProps,
		page,
		rotate,
		scale,
	} = context;

	const [svgState, svgDispatch] = useResolver<SVGElement>();
	const { value: svg, error: svgError } = svgState;

	invariant(page, 'Attempted to render page SVG, but no page was specified.');

	/**
	 * Called when a page is rendered successfully
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
	 * Called when a page fails to render
	 */
	function onRenderError() {
		if (!svgError) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		if (isCancelException(svgError)) {
			return;
		}

		warning(false, svgError.toString());

		if (onRenderErrorProps) {
			onRenderErrorProps(svgError);
		}
	}

	const viewport = computed(() =>
		page.getViewport({ scale, rotation: rotate }),
	);

	function resetSVG() {
		svgDispatch({ type: 'RESET' });
	}

	useEffect(resetSVG, [page, svgDispatch, viewport]);

	function renderSVG() {
		if (!page) {
			return;
		}

		const cancellable = makeCancellable(page.getOperatorList());

		cancellable.promise
			.then((operatorList) => {
				const svgGfx: SVGGraphics = new pdfjs.SVGGraphics(
					page.commonObjs,
					page.objs,
				);

				svgGfx
					.getSVG(operatorList, viewport.value)
					.then((nextSvg) => {
						svgDispatch({ type: 'RESOLVE', value: nextSvg });
					})
					.catch((error) => {
						svgDispatch({ type: 'REJECT', error });
					});
			})
			.catch((error) => {
				svgDispatch({ type: 'REJECT', error });
			});

		return () => cancelRunningTask(cancellable);
	}

	useEffect(renderSVG, [page, svgDispatch, viewport]);

	useEffect(
		() => {
			if (svg === undefined) {
				return;
			}

			if (svg === false) {
				onRenderError();
				return;
			}

			onRenderSuccess();
		},
		// Ommitted callbacks so they are not called every time they change
		[svg],
	);

	function drawPageOnContainer(element: HTMLDivElement | null) {
		if (!element || !svg) {
			return;
		}

		// Append SVG element to the main container, if this hasn't been done already
		if (!element.firstElementChild) {
			element.appendChild(svg);
		}

		const { width, height } = viewport.value;

		svg.setAttribute('width', `${width}`);
		svg.setAttribute('height', `${height}`);
	}

	const { width, height } = viewport.value;

	return () => (
		<div
			class="react-pdf__Page__svg"
			// Note: This cannot be shortened, as we need this function to be called with each render.
			ref={(ref) => drawPageOnContainer(ref)}
			style={{
				display: 'block',
				backgroundColor: 'white',
				overflow: 'hidden',
				width,
				height,
				userSelect: 'none',
			}}
		/>
	);
});
