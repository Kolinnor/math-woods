type AvatarArtworkCreditProps = {
  label: string;
};

export function AvatarArtworkCredit({ label }: AvatarArtworkCreditProps) {
  return (
    <p className="avatar-artwork-credit">
      {label}:{" "}
      <a
        href="https://www.svgrepo.com/collection/animal-outlined-sepia-icons/"
        target="_blank"
        rel="noopener noreferrer"
      >
        Animal Outlined Sepia Icons
      </a>
      {" - "}AsIan{" - "}
      <a href="https://www.svgrepo.com/" target="_blank" rel="noopener noreferrer">
        SVG Repo
      </a>
      {" - "}
      <a
        href="https://creativecommons.org/licenses/by/4.0/"
        target="_blank"
        rel="noopener noreferrer license"
      >
        CC BY 4.0
      </a>
      .
    </p>
  );
}
