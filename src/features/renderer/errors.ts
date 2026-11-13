/**
 * Thrown by a renderer's onSubmit when the server rejects the answers. `errors` maps question
 * ids to the message the respondent should see next to that question.
 */
export class SubmissionRejected extends Error {
  readonly errors: Record<string, string>;
  constructor(errors: Record<string, string>) {
    super("Some answers need attention.");
    this.name = "SubmissionRejected";
    this.errors = errors;
  }
}
