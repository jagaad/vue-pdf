import { readonly, ref } from 'vue';

type State<T> =
	| { value: T; error: undefined }
	| { value: false; error: Error }
	| { value: undefined; error: undefined };

type Action<T> =
	| { type: 'RESOLVE'; value: T }
	| { type: 'REJECT'; error: Error }
	| { type: 'RESET' };

function reducer<T>(state: State<T>, action: Action<T>): State<T> {
	switch (action.type) {
		case 'RESOLVE':
			return { value: action.value, error: undefined };
		case 'REJECT':
			return { value: false, error: action.error };
		case 'RESET':
			return { value: undefined, error: undefined };
		default:
			return state;
	}
}

export function useResolver<T>() {
	return useReducer(reducer<T>, { value: undefined, error: undefined });
}

// https://markus.oberlehner.net/blog/usestate-and-usereducer-with-the-vue-3-composition-api/
// https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/react/index.d.ts
function useReducer<R extends Reducer<any, any>, I>(
	reducer: R,
	initializerArg: ReducerState<R>,
): [ReducerState<R>, Dispatch<ReducerAction<R>>] {
	const state = ref(initializerArg);
	const dispatch = (action: ReducerAction<R>) => {
		state.value = reducer(state.value, action);
	};

	// @ts-expect-error
	return [readonly(state), dispatch];
}

type Dispatch<A> = (value: A) => void;
type Reducer<S, A> = (prevState: S, action: A) => S;
type ReducerState<R extends Reducer<any, any>> = R extends Reducer<infer S, any>
	? S
	: never;

type ReducerAction<R extends Reducer<any, any>> = R extends Reducer<
	any,
	infer A
>
	? A
	: never;
