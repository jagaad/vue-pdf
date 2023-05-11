/**
 * Loads a PDF document. Passes it to all children.
 */
import { ref, type Ref } from 'vue';
import makeEventProps from 'make-event-props';
import makeCancellable from 'make-cancellable-promise';
import invariant from 'tiny-invariant';
import warning from 'tiny-warning';
import * as pdfjs from 'pdfjs-dist';

import DocumentContext from './DocumentContext';

import Message from './Message';

import LinkService from './LinkService';
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
	children?: React.ReactNode;
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

const Document = forwardRef(function Document(
	{
		children,
		className,
		error = 'Failed to load PDF file.',
		externalLinkRel,
		externalLinkTarget,
		file,
		inputRef,
		imageResourcesPath,
		loading = 'Loading PDF…',
		noData = 'No PDF file specified.',
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
	}: DocumentProps,
	forwardedRef,
) {
	const [sourceState, sourceDispatch] = useResolver<Source | null>();
	const { value: source, error: sourceError } = sourceState;
	const [pdfState, pdfDispatch] = useResolver<PDFDocumentProxy>();
	const { value: pdf, error: pdfError } = pdfState;

	const linkService = ref(new LinkService());

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

	useImperativeHandle(
		forwardedRef,
		() => {
			return {
				linkService,
				pages,
				viewer,
			};
		},
		[],
	);

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
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
		linkService.value.setDocument(pdf);
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[pdf],
	);

	function setupLinkService() {
		linkService.value.setViewer(viewer.value);
		linkService.value.setExternalLinkRel(externalLinkRel);
		linkService.value.setExternalLinkTarget(externalLinkTarget);
	}

	useEffect(setupLinkService, [externalLinkRel, externalLinkTarget]);

	function registerPage(pageIndex: number, ref: HTMLDivElement) {
		pages.value[pageIndex] = ref;
	}

	function unregisterPage(pageIndex: number) {
		delete pages.value[pageIndex];
	}

	const childContext = {
		imageResourcesPath,
		linkService: linkService.value,
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

	function renderChildren() {
		return (
			<DocumentContext.Provider value={childContext}>
				{children}
			</DocumentContext.Provider>
		);
	}

	function renderContent() {
		if (!file) {
			return (
				<Message type="no-data">
					{typeof noData === 'function' ? noData() : noData}
				</Message>
			);
		}

		if (pdf === undefined || pdf === null) {
			return (
				<Message type="loading">
					{typeof loading === 'function' ? loading() : loading}
				</Message>
			);
		}

		if (pdf === false) {
			return (
				<Message type="error">
					{typeof error === 'function' ? error() : error}
				</Message>
			);
		}

		return renderChildren();
	}

	return (
		<div
			class={['react-pdf__Document', className]}
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

export default Document;
