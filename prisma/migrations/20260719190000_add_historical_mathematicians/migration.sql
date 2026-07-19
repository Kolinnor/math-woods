CREATE TABLE "Mathematician" (
  "id" SERIAL NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lifespan" TEXT NOT NULL,
  "birthPlace" TEXT NOT NULL,
  "portraitUrl" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Mathematician_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mathematician_slug_key" ON "Mathematician"("slug");
CREATE INDEX "Mathematician_name_idx" ON "Mathematician"("name");

ALTER TABLE "Mathematician"
  ADD CONSTRAINT "Mathematician_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "Mathematician" ("slug", "name", "lifespan", "birthPlace", "portraitUrl") VALUES
  ('leonhard-euler', 'Leonhard Euler', '1707-1783', 'Basel, Switzerland', '/mathematicians/leonhard-euler.jpg'),
  ('carl-friedrich-gauss', 'Carl Friedrich Gauss', '1777-1855', 'Brunswick, Germany', '/mathematicians/carl-friedrich-gauss.jpg'),
  ('bernhard-riemann', 'Bernhard Riemann', '1826-1866', 'Breselenz, Kingdom of Hanover', '/mathematicians/bernhard-riemann.jpg'),
  ('sofia-kovalevskaya', 'Sofia Kovalevskaya', '1850-1891', 'Moscow, Russian Empire', '/mathematicians/sofia-kovalevskaya.jpg'),
  ('emmy-noether', 'Emmy Noether', '1882-1935', 'Erlangen, Germany', '/mathematicians/emmy-noether.jpg'),
  ('srinivasa-ramanujan', 'Srinivasa Ramanujan', '1887-1920', 'Erode, India', '/mathematicians/srinivasa-ramanujan.jpg');
