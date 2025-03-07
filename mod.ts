import * as z from "npm:zod@3.23.3";
import * as assert from "jsr:@std/assert@1.0.11";
import * as cli from "jsr:@std/cli@1.0.14";
import * as fs from "jsr:@std/fs@1.0.14";

const NihReporterSearchResponse = z.object({
  meta: z.object({
    search_id: z.string(),
    total: z.number(),
    offset: z.number(),
    limit: z.number(),
    sort_field: z.string(),
  }),
  results: z.object({
    appl_id: z.number(),
    fiscal_year: z.number(),
    project_num: z.string(),
    award_amount: z.number().nullable(),
    is_active: z.boolean(),
    contact_pi_name: z.string().nullable(),
    budget_start: z.string().datetime().nullable(),
    budget_end: z.string().datetime().nullable(),
    project_title: z.string(),
    project_detail_url: z.string().url(),
    project_start_date: z.string().datetime().nullable(),
    project_end_date: z.string().datetime(),
    date_added: z.string().datetime(),
    organization: z.object({
      org_name: z.string().nullable(),
      org_city: z.string().nullable(),
      org_state: z.string().nullable(),
    }),
    terms: z.string().nullable(),
    abstract_text: z.string().nullable(),
    pref_terms: z.string().nullable(),
  })
    .transform(({ organization, ...rest }) => ({
      ...rest,
      org_name: organization.org_name,
      org_city: organization.org_city,
      org_state: organization.org_state,
    }))
    .array(),
});

// @deno-fmt-ignore
const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME",
  "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA",
  "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
];

async function fetchNihReporterResultPage(
  options: {
    offset: number;
    limit: number;
    state: string;
    chunk: { year: number; end: boolean };
  },
) {
  assert.assert(options.limit <= 500, "max limit is 500");

  const criteria: Record<string, unknown> = {
    project_end_date: {
      from_date: `${options.chunk.year}-01-01`,
      ...(!options.chunk.end
        ? {
          to_date: `${options.chunk.year}-12-31`,
        }
        : {}),
    },
    org_states: [options.state],
  };

  const response = await fetch(
    "https://api.reporter.nih.gov/v2/projects/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        criteria,
        offset: options.offset,
        limit: options.limit,
        sort_field: "project_start_date",
      }),
    },
  );

  return NihReporterSearchResponse.parse(await response.json());
}

async function fetchNIHDataByState(options: { dir: URL }) {
  for (const state of US_STATES) {
    console.log(`Fetching data for state: ${state}`);
    for (
      const chunk of Array.from(
        { length: 5 },
        (_, i) => ({ year: 2025 + i, end: i === 4 }),
      )
    ) {
      const { meta: { total } } = await fetchNihReporterResultPage({
        offset: 0,
        limit: 0,
        state,
        chunk,
      });

      assert.assert(
        total <= 14999,
        `State ${state} exceeds pagination limit, got ${total}.`,
      );

      if (total === 0) {
        console.log(`No records found for ${state}`);
        continue;
      }

      let offset = 0;
      const limit = 500;
      const dir = new URL(
        `${options.dir}/${state}/${chunk.year}/`,
        import.meta.url,
      );
      await fs.ensureDir(dir);

      while (offset < total) {
        const fileName = `${offset}-${offset + limit - 1}.json`;
        const target = new URL(fileName, dir);

        if (!(await fs.exists(target))) {
          try {
            const { results } = await fetchNihReporterResultPage({
              offset,
              limit,
              state,
              chunk,
            });
            await Deno.writeTextFile(target, JSON.stringify(results, null, 2));
            console.log(`Wrote ${target}`);
            await new Promise((resolve) => setTimeout(resolve, 100)); // Rate limiting
          } catch (e) {
            console.log(e)
            console.error(`Failed to get ${fileName} for ${state}`);
          }
        }
        offset += limit;
      }
      return;
    }
  }
}

const flags = cli.parseArgs(Deno.args, {
  string: ["outdir"],
});

assert.assert(flags.outdir, "must provide an output directory");

await fetchNIHDataByState({
  dir: new URL(flags.outdir, import.meta.url),
});
