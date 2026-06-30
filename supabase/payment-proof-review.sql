alter table public.orders
  add column if not exists payment_proof_status text not null default 'none',
  add column if not exists payment_proof_rejection_reason text,
  add column if not exists payment_proof_reviewed_at timestamptz;

alter table public.orders
  drop constraint if exists orders_payment_proof_status_check;

alter table public.orders
  add constraint orders_payment_proof_status_check
  check (payment_proof_status in ('none', 'pending', 'valid', 'invalid'));

update public.orders
set payment_proof_status = case
  when payment_method = 'virement' and payment_proof_path is not null then 'pending'
  else 'none'
end
where payment_proof_status = 'none';
