UPDATE "FaqItem"
SET
  "answerMarkdown" = 'The 1-100 score is a rough signal, not an objective measure. It assumes that the reader has the necessary prerequisites, and difficulty can vary with familiarity with the subject or the trick involved. As a loose convention: 1-10 is first steps or middle-school reference level; 10-25 is beginner or high-school level; 25-50 is intermediate or undergraduate level; 50-70 is advanced or graduate level; 70-90 is expert or specialized; and 90-100 is research-level.',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "question" = 'How should I use the difficulty score?';
