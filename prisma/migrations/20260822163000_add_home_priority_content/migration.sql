CREATE TABLE "HomePriorityContent" (
    "language" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomePriorityContent_pkey" PRIMARY KEY ("language")
);

INSERT INTO "HomePriorityContent" ("language", "title", "body", "updatedAt")
VALUES
    (
        'fr',
        'Priorités du moment',
        'On relit en ce moment les énoncés d''algèbre linéaire, on rend l''éditeur de solutions plus supportable, et le concours mensuel en équipes arrive en septembre. Le site avance par petits coups de pioche — vos remarques orientent la suite.',
        CURRENT_TIMESTAMP
    ),
    (
        'en',
        'What we''re working on',
        'We are currently reviewing linear algebra problem statements, making the solution editor easier to use, and preparing a monthly team contest for September. The site moves forward one small improvement at a time, and your feedback helps shape what comes next.',
        CURRENT_TIMESTAMP
    );
