import { type FunctionalComponent } from 'vue';

type MessageProps = {
	type: 'error' | 'loading' | 'no-data';
};

const Message: FunctionalComponent<MessageProps> = ({ type }, { slots }) => {
	return (
		<div
			class={`react-pdf__message react-pdf__message--${type}`}
			v-slots={slots}
		/>
	);
};

export default Message;
