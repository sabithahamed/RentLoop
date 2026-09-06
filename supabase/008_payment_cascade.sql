-- RentLoop — a payment belongs to its tenancy
--
-- payments.tenancy_id was declared without ON DELETE CASCADE, so deleting a
-- tenancy was refused by the foreign key. Nothing in the app deletes a
-- tenancy, which is why it went unnoticed — but the demo seed does, and it was
-- not checking the result. Every run therefore left the old data in place and
-- inserted a second copy beside it. After four runs the demo account owned
-- three of every property, and every screen listing them showed each one three
-- times.
--
-- rent_periods already cascades. This brings payments in line: a payment has
-- no meaning apart from the tenancy it was made against, so it should not
-- outlive it.

alter table payments drop constraint if exists payments_tenancy_id_fkey;

alter table payments
  add constraint payments_tenancy_id_fkey
  foreign key (tenancy_id) references tenancies(id) on delete cascade;
