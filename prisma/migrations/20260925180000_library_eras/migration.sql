-- Historical events (congresses, prizes, foundations…) next to discoveries and periods.
ALTER TYPE "HistoryMilestoneType" ADD VALUE IF NOT EXISTS 'EVENT' AFTER 'PERIOD';

-- CreateTable
CREATE TABLE "LibraryEra" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6d6555',
    "nameFr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionFr" TEXT NOT NULL DEFAULT '',
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryEra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEra_slug_key" ON "LibraryEra"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEra_startYear_key" ON "LibraryEra"("startYear");

-- Default eras; administrators can rename, recolour, add or remove them.
INSERT INTO "LibraryEra" ("slug", "startYear", "color", "nameFr", "nameEn", "descriptionFr", "descriptionEn", "updatedAt") VALUES
  ('premieres-civilisations', -3500, '#8a5a1c', 'Premières civilisations', 'Early civilisations', 'Mésopotamie, Égypte, Chine et Inde : numération, calcul et premières tables.', 'Mesopotamia, Egypt, China and India: numeration, computation and the first tables.', CURRENT_TIMESTAMP),
  ('mathematiques-grecques', -600, '#35658a', 'Mathématiques grecques', 'Greek mathematics', 'De Thalès à Hypatie : la démonstration devient la règle.', 'From Thales to Hypatia: proof becomes the rule.', CURRENT_TIMESTAMP),
  ('age-des-transmissions', 500, '#9a4526', 'Âge des transmissions', 'Age of transmission', 'Le zéro, l’algèbre et les chiffres indo-arabes voyagent de l’Inde à Bagdad, puis jusqu’à l’Europe.', 'Zero, algebra and Hindu–Arabic numerals travel from India to Baghdad, then on to Europe.', CURRENT_TIMESTAMP),
  ('renaissance-revolution-scientifique', 1400, '#2e6242', 'Renaissance et révolution scientifique', 'Renaissance and scientific revolution', 'Équations cubiques, notation symbolique, géométrie analytique et calcul infinitésimal.', 'Cubic equations, symbolic notation, analytic geometry and calculus.', CURRENT_TIMESTAMP),
  ('siecle-des-lumieres', 1700, '#8a3d62', 'Siècle des Lumières', 'Age of Enlightenment', 'Euler, Lagrange et les académies : l’analyse conquiert la mécanique et l’astronomie.', 'Euler, Lagrange and the academies: analysis conquers mechanics and astronomy.', CURRENT_TIMESTAMP),
  ('rigueur-abstraction', 1800, '#3f4e70', 'Rigueur et abstraction', 'Rigour and abstraction', 'Gauss, Galois, Riemann, Cantor : fondements rigoureux et nouvelles structures.', 'Gauss, Galois, Riemann, Cantor: rigorous foundations and new structures.', CURRENT_TIMESTAMP),
  ('mathematiques-contemporaines', 1900, '#5d4a80', 'Mathématiques contemporaines', 'Contemporary mathematics', 'Des problèmes de Hilbert aux ordinateurs : axiomatique, logique et spécialisation.', 'From Hilbert’s problems to computers: axioms, logic and specialisation.', CURRENT_TIMESTAMP);
