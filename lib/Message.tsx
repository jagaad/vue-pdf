type MessageProps = {
  children: React.ReactNode;
  type: 'error' | 'loading' | 'no-data';
};

export default function Message({ children, type }: MessageProps) {
	return (
		<div class={`react-pdf__message react-pdf__message--${type}`}>
			{children}
		</div>
	);
}