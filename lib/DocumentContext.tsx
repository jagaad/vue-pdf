import { type InjectionKey } from 'vue';
import type { DocumentContextType } from './shared/types';

const documentContext: InjectionKey<DocumentContextType> = Symbol(
	'DocumentContextType',
);

export default documentContext;
