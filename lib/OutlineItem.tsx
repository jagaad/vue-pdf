import { defineComponent, inject, ref } from 'vue';
import invariant from 'tiny-invariant';

import { DocumentContext } from './DocumentContext';
import { OutlineContext } from './OutlineContext';

import { PdfRef } from './PdfRef';

import { isDefined } from './shared/utils';

import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { RefProxy } from 'pdfjs-dist/types/src/display/api';

function useCachedValue<T>(getter: () => T): () => T {
	const _ref = ref<T>();

	const currentValue = _ref.value;

	if (isDefined(currentValue)) {
		return () => currentValue;
	}

	return () => {
		const value = getter();

		_ref.value = value;

		return value;
	};
}

type PDFOutline = Awaited<ReturnType<PDFDocumentProxy['getOutline']>>;

type PDFOutlineItem = PDFOutline[number];

type OutlineItemProps = {
	item: PDFOutlineItem;
};

export const OutlineItem = defineComponent<OutlineItemProps>((props) => {
	const documentContext = inject(DocumentContext, null);

	invariant(
		documentContext,
		'Unable to find Document context. Did you wrap <Outline /> in <Document />?',
	);

	const outlineContext = inject(OutlineContext, null);

	invariant(outlineContext, 'Unable to find Outline context.');

	const mergedProps = { ...documentContext, ...outlineContext, ...props };
	const { item, onClick: onClickProps, pdf, ...otherProps } = mergedProps;

	invariant(
		pdf,
		'Attempted to load an outline, but no document was specified.',
	);

	const getDestination = useCachedValue(() => {
		if (typeof item.dest === 'string') {
			return pdf.getDestination(item.dest);
		}

		return item.dest;
	});

	const getPageIndex = useCachedValue(async () => {
		const destination = await getDestination();

		if (!destination) {
			throw new Error('Destination not found.');
		}

		const [ref] = destination as [RefProxy];

		return pdf.getPageIndex(new PdfRef(ref));
	});

	const getPageNumber = useCachedValue(async () => {
		const pageIndex = await getPageIndex();

		return pageIndex + 1;
	});

	function onClick(event: MouseEvent) {
		event.preventDefault();

		if (!onClickProps) {
			return false;
		}

		return Promise.all([
			getDestination(),
			getPageIndex(),
			getPageNumber(),
		]).then(([dest, pageIndex, pageNumber]) => {
			onClickProps({
				dest,
				pageIndex,
				pageNumber,
			});
		});
	}

	function renderSubitems() {
		if (!item.items || !item.items.length) {
			return null;
		}

		const { items: subitems } = item;

		return (
			<ul>
				{subitems.map((subitem, subitemIndex) => (
					<OutlineItem
						key={typeof subitem.dest === 'string' ? subitem.dest : subitemIndex}
						item={subitem}
						{...otherProps}
					/>
				))}
			</ul>
		);
	}

	return () => (
		<li>
			<a href="#" onClick={onClick}>
				{item.title}
			</a>
			{renderSubitems()}
		</li>
	);
});
