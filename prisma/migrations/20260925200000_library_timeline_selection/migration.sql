-- Entries chosen by the editors appear first on the timeline of the library home page.
ALTER TABLE "Mathematician" ADD COLUMN "featuredOnTimeline" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "HistoryMilestone" ADD COLUMN "featuredOnTimeline" BOOLEAN NOT NULL DEFAULT false;
