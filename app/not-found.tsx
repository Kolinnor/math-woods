import { SiteErrorPage } from "@/components/SiteErrorPage";

export default function NotFound() {
  return (
    <SiteErrorPage
      code="404 - Path not found"
      title="You got lost in the forest."
      message="This path does not lead to a Math Woods page. It may have moved, or the link may be incomplete."
      french={{
        code: "404 - Page introuvable",
        title: "Vous vous êtes perdu dans la forêt.",
        message: "Ce chemin ne mène à aucune page de Math Woods. La page a peut-être été déplacée, ou le lien est incomplet."
      }}
    />
  );
}
