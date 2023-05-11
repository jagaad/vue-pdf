/**
 * Loads a PDF document. Passes it to all children.
 */
import { ref, type Ref, defineComponent, provide, Fragment } from 'vue';
import makeEventProps from 'make-event-props';
import makeCancellable from 'make-cancellable-promise';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';
import * as pdfjs from 'pdfjs-dist';

import DocumentContext from './DocumentContext';

import { Message } from './Message';

import { LinkService } from './LinkService';
import PasswordResponses from './PasswordResponses';

import {
	cancelRunningTask,
	dataURItoByteString,
	displayCORSWarning,
	isArrayBuffer,
	isBlob,
	isBrowser,
	isDataURI,
	loadFromFile,
} from './shared/utils';

import { useResolver } from './shared/hooks';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { EventProps } from 'make-event-props';
import type {
	ClassName,
	DocumentCallback,
	DocumentContextType,
	ExternalLinkRel,
	ExternalLinkTarget,
	File,
	ImageResourcesPath,
	NodeOrRenderer,
	OnDocumentLoadError,
	OnDocumentLoadProgress,
	OnDocumentLoadSuccess,
	OnError,
	OnItemClickArgs,
	OnPasswordCallback,
	Options,
	PasswordResponse,
	RenderMode,
	ScrollPageIntoViewArgs,
	Source,
} from './shared/types';

const { PDFDataRangeTransport } = pdfjs;

type OnItemClick = (args: OnItemClickArgs) => void;

type OnPassword = (
	callback: OnPasswordCallback,
	reason: PasswordResponse,
) => void;

type OnSourceError = OnError;

type OnSourceSuccess = () => void;

type DocumentProps = {
	className?: ClassName;
	error?: NodeOrRenderer;
	externalLinkRel?: ExternalLinkRel;
	externalLinkTarget?: ExternalLinkTarget;
	file?: File;
	imageResourcesPath?: ImageResourcesPath;
	inputRef?: Ref<HTMLDivElement>;
	loading?: NodeOrRenderer;
	noData?: NodeOrRenderer;
	onItemClick?: OnItemClick;
	onLoadError?: OnDocumentLoadError;
	onLoadProgress?: OnDocumentLoadProgress;
	onLoadSuccess?: OnDocumentLoadSuccess;
	onPassword?: OnPassword;
	onSourceError?: OnSourceError;
	onSourceSuccess?: OnSourceSuccess;
	options?: Options;
	renderMode?: RenderMode;
	rotate?: number | null;
} & EventProps<DocumentCallback | false | undefined>;

const defaultOnPassword: OnPassword = (callback, reason) => {
	switch (reason) {
		case PasswordResponses.NEED_PASSWORD: {
			// eslint-disable-next-line no-alert
			const password = prompt('Enter the password to open this PDF file.');
			callback(password);
			break;
		}
		case PasswordResponses.INCORRECT_PASSWORD: {
			// eslint-disable-next-line no-alert
			const password = prompt('Invalid password. Please try again.');
			callback(password);
			break;
		}
		default:
	}
};

export const Document = defineComponent<DocumentProps>((props, ctx) => {
	const { expose, slots } = ctx;
	const {
		externalLinkRel,
		externalLinkTarget,
		file,
		inputRef,
		imageResourcesPath,
		onItemClick,
		onLoadError: onLoadErrorProps,
		onLoadProgress,
		onLoadSuccess: onLoadSuccessProps,
		onPassword = defaultOnPassword,
		onSourceError: onSourceErrorProps,
		onSourceSuccess: onSourceSuccessProps,
		options,
		renderMode,
		rotate,
		...otherProps
	} = props;

	const [sourceState, sourceDispatch] = useResolver<Source | null>();
	const { value: source, error: sourceError } = sourceState;
	const [pdfState, pdfDispatch] = useResolver<PDFDocumentProxy>();
	const { value: pdf, error: pdfError } = pdfState;

	const linkService = new LinkService();

	const pages = ref<HTMLDivElement[]>([]);

	const viewer = ref({
		// Handling jumping to internal links target
		scrollPageIntoView: ({
			dest,
			pageIndex,
			pageNumber,
		}: ScrollPageIntoViewArgs) => {
			// First, check if custom handling of onItemClick was provided
			if (onItemClick) {
				onItemClick({ dest, pageIndex, pageNumber });
				return;
			}

			// If not, try to look for target page within the <Document>.
			const page = pages.value[pageIndex];

			if (page) {
				// Scroll to the page automatically
				page.scrollIntoView();
				return;
			}

			warning(
				false,
				`An internal link leading to page ${pageNumber} was clicked, but neither <Document> was provided with onItemClick nor it was able to find the page within itself. Either provide onItemClick to <Document> and handle navigating by yourself or ensure that all pages are rendered within <Document>.`,
			);
		},
	});

	expose({
		linkService,
		pages,
		viewer,
	});

	/**
	 * Called when a document source is resolved correctly
	 */
	function onSourceSuccess() {
		if (onSourceSuccessProps) {
			onSourceSuccessProps();
		}
	}

	/**
	 * Called when a document source failed to be resolved correctly
	 */
	function onSourceError() {
		if (!sourceError) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		warning(false, sourceError.toString());

		if (onSourceErrorProps) {
			onSourceErrorProps(sourceError);
		}
	}

	function resetSource() {
		sourceDispatch({ type: 'RESET' });
	}

	useEffect(resetSource, [file, sourceDispatch]);

	const findDocumentSource = useCallback(async (): Promise<Source | null> => {
		if (!file) {
			return null;
		}

		// File is a string
		if (typeof file === 'string') {
			if (isDataURI(file)) {
				const fileByteString = dataURItoByteString(file);
				return { data: fileByteString };
			}

			displayCORSWarning();
			return { url: file };
		}

		// File is PDFDataRangeTransport
		if (file instanceof PDFDataRangeTransport) {
			return { range: file };
		}

		// File is an ArrayBuffer
		if (isArrayBuffer(file)) {
			return { data: file };
		}

		/**
		 * The cases below are browser-only.
		 * If you're running on a non-browser environment, these cases will be of no use.
		 */
		if (isBrowser) {
			// File is a Blob
			if (isBlob(file)) {
				const data = await loadFromFile(file);

				return { data };
			}
		}

		// At this point, file must be an object
		invariant(
			typeof file === 'object',
			'Invalid parameter in file, need either Uint8Array, string or a parameter object',
		);

		invariant(
			'data' in file || 'range' in file || 'url' in file,
			'Invalid parameter object: need either .data, .range or .url',
		);

		// File .url is a string
		if ('url' in file && typeof file.url === 'string') {
			if (isDataURI(file.url)) {
				const { url, ...otherParams } = file;
				const fileByteString = dataURItoByteString(url);
				return { data: fileByteString, ...otherParams };
			}

			displayCORSWarning();
		}

		return file;
	}, [file]);

	useEffect(() => {
		const cancellable = makeCancellable(findDocumentSource());

		cancellable.promise
			.then((nextSource) => {
				sourceDispatch({ type: 'RESOLVE', value: nextSource });
			})
			.catch((error) => {
				sourceDispatch({ type: 'REJECT', error });
			});

		return () => {
			cancelRunningTask(cancellable);
		};
	}, [findDocumentSource, sourceDispatch]);

	useEffect(
		() => {
			if (typeof source === 'undefined') {
				return;
			}

			if (source === false) {
				onSourceError();
				return;
			}

			onSourceSuccess();
		},
		// Ommitted callbacks so they are not called every time they change
		[source],
	);

	/**
	 * Called when a document is read successfully
	 */
	function onLoadSuccess() {
		if (!pdf) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		if (onLoadSuccessProps) {
			onLoadSuccessProps(pdf);
		}

		pages.value = new Array(pdf.numPages);
		linkService.setDocument(pdf);
	}

	/**
	 * Called when a document failed to read successfully
	 */
	function onLoadError() {
		if (!pdfError) {
			// Impossible, but TypeScript doesn't know that
			return;
		}

		warning(false, pdfError.toString());

		if (onLoadErrorProps) {
			onLoadErrorProps(pdfError);
		}
	}

	function resetDocument() {
		pdfDispatch({ type: 'RESET' });
	}

	useEffect(resetDocument, [pdfDispatch, source]);

	function loadDocument() {
		if (!source) {
			return;
		}

		const documentInitParams = options
			? {
					...source,
					...options,
			  }
			: source;

		const destroyable = pdfjs.getDocument(documentInitParams);
		if (onLoadProgress) {
			destroyable.onProgress = onLoadProgress;
		}
		if (onPassword) {
			destroyable.onPassword = onPassword;
		}
		const loadingTask = destroyable;

		loadingTask.promise
			.then((nextPdf) => {
				pdfDispatch({ type: 'RESOLVE', value: nextPdf });
			})
			.catch((error) => {
				pdfDispatch({ type: 'REJECT', error });
			});

		return () => {
			loadingTask.destroy();
		};
	}

	useEffect(
		loadDocument,
		// Ommitted callbacks so they are not called every time they change
		[options, pdfDispatch, source],
	);

	useEffect(
		() => {
			if (typeof pdf === 'undefined') {
				return;
			}

			if (pdf === false) {
				onLoadError();
				return;
			}

			onLoadSuccess();
		},
		// Ommitted callbacks so they are not called every time they change
		[pdf],
	);

	function setupLinkService() {
		linkService.setViewer(viewer.value);
		linkService.setExternalLinkRel(externalLinkRel);
		linkService.setExternalLinkTarget(externalLinkTarget);
	}

	useEffect(setupLinkService, [externalLinkRel, externalLinkTarget]);

	function registerPage(pageIndex: number, ref: HTMLDivElement) {
		pages.value[pageIndex] = ref;
	}

	function unregisterPage(pageIndex: number) {
		delete pages.value[pageIndex];
	}

	const childContext: DocumentContextType = {
		imageResourcesPath,
		linkService,
		pdf,
		registerPage,
		renderMode,
		rotate,
		unregisterPage,
	};

	const eventProps = useMemo(
		() => makeEventProps(otherProps, () => pdf),
		[otherProps, pdf],
	);

	function renderContent() {
		if (!file) {
			return (
				<Message type="no-data">
					{typeof props.noData === 'function' ? props.noData() : props.noData}
				</Message>
			);
		}

		if (pdf === undefined || pdf === null) {
			return (
				<Message type="loading">
					{typeof props.loading === 'function'
						? props.loading()
						: props.loading}
				</Message>
			);
		}

		if (pdf === false) {
			return (
				<Message type="error">
					{typeof props.error === 'function' ? props.error() : props.error}
				</Message>
			);
		}

		provide(DocumentContext, childContext);

		return <Fragment v-slots={slots} />;
	}

	return () => (
		<div
			class={['react-pdf__Document', props.className]}
			ref={inputRef}
			style={{
				['--scale-factor' as string]: '1',
			}}
			{...eventProps}
		>
			{renderContent()}
		</div>
	);
});
