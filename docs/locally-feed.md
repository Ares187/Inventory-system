# Locally inventory feed

Feldryva builds one `upc,qty,price` CSV per active Sneaker Factory location.
The owner can preview or download CSVs from **Locally Integration** in the app menu.
The dashboard and CSV use the same rules. Preview works with publishing disabled and
does not contact Locally. Store 5 is outside the feed allowlist.

The [Locally retailer guide](https://hub.locally.com/docs/retailers-set-up-your-inventory-feed)
specifies 12-digit UPCs with valid check digits, quantity on hand, in-store price,
and a consistent filename. It lists SFTP, email and hosted URLs among its delivery
options. Hosted URLs are fetched every six hours. The code uses one private HTTPS
URL per store for this option. No scheduled workflow or third-party dependency is needed.

## Deploy for preview

Deploy the code with `LOCALLY_FEED_ENABLED` unset or set to `false`. No Locally
credentials are needed to preview. This change uses the existing
`stores.locally_location_id` field and `locally_exports` history table.

Open **Locally Integration** as owner. Compare the downloadable CSV and readiness
counts for each store. Fix missing or invalid UPCs, duplicate UPC assignments,
and invalid stock or prices before launch. Keep manufacturer UPCs as text so
leading zeros are preserved. Check-digit validation verifies format. Verify each
UPC against the label or supplier catalog for its exact variant.

## Confirm with Locally before launch

Confirm that Sneaker Factory's retailer account can use a per-store hosted
download URL containing a private token in its path. Ask for the location IDs for
Millburn, Basking Ridge, and Denville. Confirm that each download replaces the
prior store snapshot and that a zero or omitted UPC clears prior availability.
The feed explicitly includes zero stock for active, valid variants with an
inventory record. Deleted and inactive variants are omitted. If Locally requires
another method for clearing old stock, keep the feed disabled until that is implemented.

## Configure and enable at launch

Save the confirmed IDs in Supabase. Replace the three placeholder strings with
the actual IDs. Keep the mapping table separate from the Hike outlet mapping.

```sql
update public.stores
set locally_location_id = case id
  when 1 then 'MILLBURN_LOCALLY_ID'
  when 2 then 'BASKING_RIDGE_LOCALLY_ID'
  when 3 then 'DENVILLE_LOCALLY_ID'
end
where id in (1, 2, 3);

select id, name, locally_location_id
from public.stores
where id in (1, 2, 3)
order by id;
```

Set a private 64-character lowercase hex `LOCALLY_FEED_SECRET` in Vercel's
Production Environment Variables. For example, in the VS Code PowerShell terminal:

```powershell
[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
```

This generator requires PowerShell 7 or later. For Windows PowerShell 5.1:

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
```

After the real counts and exact UPCs are entered, approve all three previews.
Make sure the production host serves the approved build. Set
`LOCALLY_FEED_ENABLED=true` in Vercel Production and redeploy. Open
**Locally Integration** to get each store's private feed URL and give it only to
Locally for the corresponding location. Treat a complete feed URL as a credential.

Confirm the first successful ingestion in the Locally retailer portal. Check a
known UPC in each store, a zero-stock UPC, and an omitted UPC that was previously
listed. Recent Exports shows when the app served a file. Locally's portal confirms
ingestion. For a stop, set `LOCALLY_FEED_ENABLED=false` and redeploy, and coordinate
with Locally to clear or disable any previously published inventory.
