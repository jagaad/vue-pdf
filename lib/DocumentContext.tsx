import { type InjectionKey } from 'vue';
import type { DocumentContextType } from './shared/types';

export const DocumentContext: InjectionKey<DocumentContextType> = Symbol(
	'DocumentContextType',
);
