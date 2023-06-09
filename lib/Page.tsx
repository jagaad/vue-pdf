import {
	inject,
	provide,
	ref,
	type Ref,
	Fragment,
	defineComponent,
	computed,
} from 'vue';
import makeCancellable from 'make-cancellable-promise';
import makeEventProps from 'make-event-props';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';

import { DocumentContext } from './DocumentContext';
import { PageContext } from './PageContext';

import { Message } from './Message';
import { PageCanvas } from './Page/PageCanvas';
import { PageSVG } from './Page/PageSVG';
import { TextLayer } from './Page/TextLayer';
import { AnnotationLayer } from './Page/AnnotationLayer';

import {
	cancelRunningTask,
	isProvided,
	makePageCallback,
} from './shared/utils';

import { useResolver } from './shared/hooks';

import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { EventProps } from 'make-event-props';
import type {
	CustomTextRenderer,
	NodeOrRenderer,
	OnGetAnnotationsError,
	OnGetAnnotationsSuccess,
	OnGetTextError,
	OnGetTextSuccess,
	OnPageLoadError,
	OnPageLoadSuccess,
	OnRenderAnnotationLayerError,
	OnRenderAnnotationLayerSuccess,
	OnRenderError,
	OnRenderSuccess,
	OnRenderTextLayerError,
	OnRenderTextLayerSuccess,
	PageCallback,
	PageContextType,
	RenderMode,
} from './shared/types';

const defaultScale = 1;

export type PageProps = {
	canvasBackground?: string;
	canvasRef?: Ref<HTMLCanvasElement>;
	className?: string;
	customTextRenderer?: CustomTextRenderer;
	devicePixelRatio?: number;
	error?: NodeOrRenderer;
	height?: number;
	imageResourcesPath?: string;
	loading?: NodeOrRenderer;
	noData?: NodeOrRenderer;
	onGetAnnotationsError?: OnGetAnnotationsError;
	onGetAnnotationsSuccess?: OnGetAnnotationsSuccess;
	onGetTextError?: OnGetTextError;
	onGetTextSuccess?: OnGetTextSuccess;
	onLoadError?: OnPageLoadError;
	onLoadSuccess?: OnPageLoadSuccess;
	onRenderAnnotationLayerError?: OnRenderAnnotationLayerError;
	onRenderAnnotationLayerSuccess?: OnRenderAnnotationLayerSuccess;
	onRenderError?: OnRenderError;
	onRenderSuccess?: OnRenderSuccess;
	onRenderTextLayerError?: OnRenderTextLayerError;
	onRenderTextLayerSuccess?: OnRenderTextLayerSuccess;
	pageIndex?: number;
	pageNumber?: number;
	pdf?: PDFDocumentProxy | false;
	renderAnnotationLayer?: boolean;
	renderForms?: boolean;
	renderInteractiveForms?: boolean;
	renderMode?: RenderMode;
	renderTextLayer?: boolean;
	rotate?: number | null;
	scale?: number;
	width?: number;
} & EventProps<PageCallback | false | undefined>;

export const Page = defineComponent<PageProps>((props) => {
	const context = inject(DocumentContext, null);

	invariant(
		context,
		'Unable to find Document context. Did you wrap <Page /> in <Document />?',
	);

	const mergedProps = { ...context, ...props };
	const {
		canvasBackground,
		canvasRef,
		children,
		className,
		customTextRenderer,
		devicePixelRatio,
		error = 'Failed to load the page.',
		height,
		loading = 'Loading page…',
		noData = 'No page specified.',
		onGetAnnotationsError: onGetAnnotationsErrorProps,
		onGetAnnotationsSuccess: onGetAnnotationsSuccessProps,
		onGetTextError: onGetTextErrorProps,
		onGetTextSuccess: onGetTextSuccessProps,
		onLoadError: onLoadErrorProps,
		onLoadSuccess: onLoadSuccessProps,
		onRenderAnnotationLayerError: onRenderAnnotationLayerErrorProps,
		onRenderAnnotationLayerSuccess: onRenderAnnotationLayerSuccessProps,
		onRenderError: onRenderErrorProps,
		onRenderSuccess: onRenderSuccessProps,
		onRenderTextLayerError: onRenderTextLayerErrorProps,
		onRenderTextLayerSuccess: onRenderTextLayerSuccessProps,
		pageIndex: pageIndexProps,
		pageNumber: pageNumberProps,
		pdf,
		registerPage,
		renderAnnotationLayer: renderAnnotationLayerProps = true,
		renderForms = false,
		renderMode = 'canvas',
		renderTextLayer: renderTextLayerProps = true,
		rotate: rotateProps,
		scale: scaleProps = defaultScale,
		unregisterPage,
		width,
		...otherProps
	} = mergedProps;

	const [pageState, pageDispatch] = useResolver<PDFPageProxy>();
	const { value: page, error: pageError } = pageState;
	const pageElement = ref<HTMLDivElement | null>(null);

	invariant(pdf, 'Attempted to load a page, but no document was specified.');

	const pageIndex = isProvided(pageNumberProps)
		? pageNumberProps - 1
		: pageIndexProps ?? null;

	const pageNumber =
		pageNumberProps ?? (isProvided(pageIndexProps) ? pageIndexProps + 1 : null);

	const rotate = rotateProps ?? (page ? page.rotate : null);

	const scale = computed(() => {
		if (!page) {
			return null;
		}

		// Be default, we'll render page at 100% * scale width.
		let pageScale = 1;

		// Passing scale explicitly null would cause the page not to render
		const scaleWithDefault = scaleProps ?? defaultScale;

		// If width/height is defined, calculate the scale of the page so it could be of desired width.
		if (width || height) {
			const viewport = page.getViewport({
				scale: 1,
				rotation: rotate as number,
			});
			if (width) {
				pageScale = width / viewport.width;
			} else if (height) {
				pageScale = height / viewport.height;
			}
		}

		return scaleWithDefault * pageScale;
	});

	function hook() {
		return () => {
			if (pageIndex === null) {
				// Impossible, but TypeScript doesn't know that
				return;
			}

			if (unregisterPage) {
				unregisterPage(pageIndex);
			}
		};
	}

	useEffect(hook, [pdf, pageIndex, unregisterPage]);

	/**
	 * Called when a page is loaded successfully
	 */
	function onLoadSuccess() {
		if (onLoadSuccessProps) {
			if (!page || !scale.value) {
				// Impossible, but TypeScript doesn't know that
				return;
			}

			onLoadSuccessProps(makePageCallback(page, scale.value));
		}

		if (registerPage) {
			if (pageIndex === null || !pageElement.value) {
				// Impossible, but TypeScript doesn't know that
				return;
			}

			registerPage(pageIndex, pageElement.value);
		}
	}

	/**
	 * Called when a page failed to load
	 */
	function onLoadError() {
		if (!pageError) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		warning(false, pageError.toString());

		if (onLoadErrorProps) {
			onLoadErrorProps(pageError);
		}
	}

	function resetPage() {
		pageDispatch({ type: 'RESET' });
	}

	useEffect(resetPage, [pageDispatch, pdf, pageIndex]);

	function loadPage() {
		if (!pdf || !pageNumber) {
			return;
		}

		const cancellable = makeCancellable(pdf.getPage(pageNumber));
		const runningTask = cancellable;

		cancellable.promise
			.then((nextPage) => {
				pageDispatch({ type: 'RESOLVE', value: nextPage });
			})
			.catch((error) => {
				pageDispatch({ type: 'REJECT', error });
			});

		return () => cancelRunningTask(runningTask);
	}

	useEffect(loadPage, [pageDispatch, pdf, pageIndex, pageNumber, registerPage]);

	useEffect(
		() => {
			if (page === undefined) {
				return;
			}

			if (page === false) {
				onLoadError();
				return;
			}

			onLoadSuccess();
		},
		// Ommitted callbacks so they are not called every time they change
		[page, scale],
	);

	const childContext: PageContextType =
		// Technically there cannot be page without pageIndex, pageNumber, rotate and scale, but TypeScript doesn't know that
		page &&
		isProvided(pageIndex) &&
		isProvided(pageNumber) &&
		isProvided(rotate) &&
		isProvided(scale.value)
			? {
					canvasBackground,
					customTextRenderer,
					devicePixelRatio,
					onGetAnnotationsError: onGetAnnotationsErrorProps,
					onGetAnnotationsSuccess: onGetAnnotationsSuccessProps,
					onGetTextError: onGetTextErrorProps,
					onGetTextSuccess: onGetTextSuccessProps,
					onRenderAnnotationLayerError: onRenderAnnotationLayerErrorProps,
					onRenderAnnotationLayerSuccess: onRenderAnnotationLayerSuccessProps,
					onRenderError: onRenderErrorProps,
					onRenderSuccess: onRenderSuccessProps,
					onRenderTextLayerError: onRenderTextLayerErrorProps,
					onRenderTextLayerSuccess: onRenderTextLayerSuccessProps,
					page,
					pageIndex,
					pageNumber,
					renderForms,
					rotate,
					scale: scale.value,
			  }
			: null;

	const eventProps = computed(() =>
		makeEventProps(otherProps, () =>
			page
				? scale.value
					? makePageCallback(page, scale.value)
					: undefined
				: page,
		),
	);

	const pageKey = `${pageIndex}@${scale.value}/${rotate}`;

	const pageKeyNoScale = `${pageIndex}/${rotate}`;

	function renderMainLayer() {
		switch (renderMode) {
			case 'none':
				return null;
			case 'svg':
				return <PageSVG key={`${pageKeyNoScale}_svg`} />;
			case 'canvas':
			default:
				return <PageCanvas key={`${pageKey}_canvas`} canvasRef={canvasRef} />;
		}
	}

	function renderTextLayer() {
		if (!renderTextLayerProps) {
			return null;
		}

		return <TextLayer key={`${pageKey}_text`} />;
	}

	function renderAnnotationLayer() {
		if (!renderAnnotationLayerProps) {
			return null;
		}

		/**
		 * As of now, PDF.js 2.0.943 returns warnings on unimplemented annotations in SVG mode.
		 * Therefore, as a fallback, we render "traditional" AnnotationLayer component.
		 */
		return <AnnotationLayer key={`${pageKey}_annotations`} />;
	}

	function renderContent() {
		if (!pageNumber) {
			return (
				<Message type="no-data">
					{typeof noData === 'function' ? noData() : noData}
				</Message>
			);
		}

		if (pdf === null || page === undefined || page === null) {
			return (
				<Message type="loading">
					{typeof loading === 'function' ? loading() : loading}
				</Message>
			);
		}

		if (pdf === false || page === false) {
			return (
				<Message type="error">
					{typeof error === 'function' ? error() : error}
				</Message>
			);
		}

		provide(PageContext, childContext);

		return (
			<Fragment>
				{renderMainLayer()}
				{renderTextLayer()}
				{renderAnnotationLayer()}
				{children}
			</Fragment>
		);
	}

	return () => (
		<div
			class={['react-pdf__Page', className]}
			data-page-number={pageNumber}
			ref={pageElement}
			style={{
				['--scale-factor' as string]: `${scale.value}`,
				backgroundColor: canvasBackground || 'white',
				position: 'relative',
				minWidth: 'min-content',
				minHeight: 'min-content',
			}}
			{...eventProps.value}
		>
			{renderContent()}
		</div>
	);
});
