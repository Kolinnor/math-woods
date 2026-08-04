"use client";

import { X } from "lucide-react";
import { markdownExcerpt } from "@/lib/metadata-text";
import type { ChatReplyPreview } from "@/lib/chat-replies";

type ReplyLabels = {
  cancelReply: string;
  image: string;
  replyingTo: string;
};

function previewText(replyTo: ChatReplyPreview, imageLabel: string) {
  return markdownExcerpt(replyTo.bodyMarkdown, replyTo.hasImage ? imageLabel : "Message", 120);
}

function ReplyContent({ replyTo, imageLabel }: { replyTo: ChatReplyPreview; imageLabel: string }) {
  return (
    <>
      <strong>{replyTo.authorName}</strong>
      <span>{previewText(replyTo, imageLabel)}</span>
    </>
  );
}

export function ChatReplyQuote({
  replyTo,
  imageLabel,
  onNavigate
}: {
  replyTo: ChatReplyPreview;
  imageLabel: string;
  onNavigate: (messageId: number) => void;
}) {
  return (
    <button type="button" className="chat-reply-quote" onClick={() => onNavigate(replyTo.id)}>
      <ReplyContent replyTo={replyTo} imageLabel={imageLabel} />
    </button>
  );
}

export function ChatReplyComposerPreview({
  labels,
  onCancel,
  replyTo
}: {
  labels: ReplyLabels;
  onCancel: () => void;
  replyTo: ChatReplyPreview;
}) {
  return (
    <div className="chat-reply-composer-preview">
      <div>
        <small>{labels.replyingTo.replace("{name}", replyTo.authorName)}</small>
        <ReplyContent replyTo={replyTo} imageLabel={labels.image} />
      </div>
      <button
        type="button"
        className="icon-button secondary"
        title={labels.cancelReply}
        aria-label={labels.cancelReply}
        onClick={onCancel}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
