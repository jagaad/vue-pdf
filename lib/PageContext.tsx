import type { InjectionKey } from 'vue';
import type { PageContextType } from './shared/types';

export const PageContext: InjectionKey<PageContextType> =
	Symbol('PageContextType');
