-- Boom Meat ERP — daily Excel backup to the owner's Telegram at 11:00 Cairo.
-- An hourly job calls the `tg` function with x-backup-key; the function sends only at 11:xx Cairo, once a day,
-- so Egypt's summer/winter clock change needs nothing here.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- the key the job sends (random, never leaves the database and the function)
insert into public.erp_secrets (key, value)
values ('backup_key', encode(gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

select cron.unschedule(jobid) from cron.job where jobname = 'boom-daily-backup';
select cron.schedule('boom-daily-backup', '5 * * * *', $job$
  select net.http_post(
    url := 'https://guotkuokwedtwngsvsee.supabase.co/functions/v1/tg',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-backup-key', (select value from public.erp_secrets where key = 'backup_key')),
    body := '{"action":"backup"}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
