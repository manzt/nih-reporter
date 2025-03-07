Here be dragons

```sh
deno run -A mod.ts --outdir=data
duckdb -c "copy (select * from 'data/**/*.json') to 'data.parquet')"
```
