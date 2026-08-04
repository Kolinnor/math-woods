import { SiteErrorPage } from "@/components/SiteErrorPage";

export default function NotFound() {
  return (
    <SiteErrorPage
      code="404 - Path not found"
      title="You got lost in the forest."
      message="This path does not lead to a Math Woods page. It may have moved, or the link may be incomplete."
    />
  );
}
