import type { InjectionKey } from 'vue';
import type { PageContextType } from './shared/types';

const pageContext: InjectionKey<PageContextType> = Symbol('PageContextType');

export default pageContext;
