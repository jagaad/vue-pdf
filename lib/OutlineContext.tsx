import type { InjectionKey } from 'vue';
import type { OutlineContextType } from './shared/types';

const outlineContext: InjectionKey<OutlineContextType> =
	Symbol('OutlineContextType');

export default outlineContext;
