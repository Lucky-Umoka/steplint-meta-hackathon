import "server-only";
import { z } from "zod";
import { TeachError } from "../teach/security";
export const ProviderDiagnosticSchema = z.object({
  status: z.string().max(80).nullable(),
  reason: z.string().max(100).nullable(),
  errorCode: z.string().max(100).nullable(),
  outputTokens: z.number().nullable(),
  outputTypes: z.array(z.string().max(80)).max(20),
});
export type ProviderDiagnostic = z.infer<typeof ProviderDiagnosticSchema>;
export class StructuredResponseError extends TeachError {
  constructor(
    message: string,
    public diagnostic: ProviderDiagnostic,
  ) {
    super(502, message);
  }
}
/** Read only documented Responses fields; never expose prompt, output, headers or credentials in diagnostics. */
export function structuredJson(response: unknown, label: string): unknown {
  const envelope = z
    .object({
      status: z.string().nullable().optional(),
      output_text: z.string().nullable().optional(),
      incomplete_details: z
        .object({ reason: z.string().optional() })
        .nullable()
        .optional(),
      error: z.object({ code: z.string().optional() }).nullable().optional(),
      usage: z
        .object({ output_tokens: z.number().optional() })
        .nullable()
        .optional(),
      output: z
        .array(
          z.object({
            type: z.string(),
            content: z
              .array(
                z.object({ type: z.string(), text: z.string().optional() }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .parse(response);
  const diagnostic = ProviderDiagnosticSchema.parse({
    status: envelope.status ?? null,
    reason: envelope.incomplete_details?.reason ?? null,
    errorCode: envelope.error?.code ?? null,
    outputTokens: envelope.usage?.output_tokens ?? null,
    outputTypes: envelope.output?.map((o) => o.type) ?? [],
  });
  const text =
    envelope.output_text ||
    envelope.output
      ?.filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("");
  if (envelope.status !== "completed" || !text)
    throw new StructuredResponseError(
      `${label} did not complete${diagnostic.reason === "max_output_tokens" ? " within the response budget" : " with a usable result"}. No automatic retry was made.`,
      diagnostic,
    );
  try {
    return JSON.parse(text);
  } catch {
    throw new StructuredResponseError(
      `${label} returned incomplete JSON. No approval was saved.`,
      diagnostic,
    );
  }
}
