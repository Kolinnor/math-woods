type ChatMessageAttachmentProps = {
  alt: string;
  height: number | null;
  url: string | null;
  width: number | null;
};

export function ChatMessageAttachment({ alt, height, url, width }: ChatMessageAttachmentProps) {
  if (!url) return null;

  return (
    <a className="chat-message-attachment" href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt={alt}
        width={width ?? undefined}
        height={height ?? undefined}
        loading="lazy"
      />
    </a>
  );
}
