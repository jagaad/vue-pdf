import type { InjectionKey } from 'vue';
import type { OutlineContextType } from './shared/types';

export const OutlineContext: InjectionKey<OutlineContextType> =
	Symbol('OutlineContextType');
