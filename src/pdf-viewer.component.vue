<template>
	<div>
		<Document
			:file="url"
			:class="classes.documentRoot"
			:onLoadSuccess="onDocumentLoadSuccess"
		>
			<Page :page-number="pageNumber" class="border" />
			<div class="mx-2 mt-2 flex justify-between">
				<div>Pagina {pageNumber} din {numPages}</div>
				<div>
					<button
						:class="[previousDisabled ? 'text-gray-500' : 'text-blue-500']"
						class="mr-1 px-2"
						:disabled="previousDisabled"
						@click="pageNumber = pageNumber - 1"
					>
						Precedenta
					</button>
					<button
						:class="[nextDisabled ? 'text-gray-500' : 'text-blue-500']"
						class="ml-1 px-2"
						:disabled="nextDisabled"
						@click="pageNumber = pageNumber + 1"
					>
						Următoarea
					</button>
				</div>
			</div>
		</Document>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Document, Page, pdfjs } from '../lib';
import classes from './pdf-viewer.module.css';
import { type PDFDocumentProxy } from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.min.js',
	import.meta.url,
).toString();

defineProps<{ url: string }>();

const numPages = ref(0);
const pageNumber = ref(1);

function onDocumentLoadSuccess(doc: PDFDocumentProxy) {
	pageNumber.value = 1;
	numPages.value = doc.numPages;
}

const previousDisabled = computed(() => pageNumber.value <= 1);
const nextDisabled = computed(() => pageNumber.value >= numPages.value);
</script>
