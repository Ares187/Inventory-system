# Live Hike testing before the opening stock count

Keep Locally publication disabled during testing. Hike sync reads completed sales and can change Feldryva stock. Use temporary stock for the exact variants you plan to sell and leave enough quantity at the selling store for color confirmation.

1. Apply migration 016 in Supabase SQL Editor. It allows the verified Hike variant to supply color choices when Hike also represents it as a redundant standalone row with the same SKU and barcode.
2. In Supabase SQL Editor, run the following once immediately **before** the Hike sale you want to test. This starts a new window and excludes earlier sales. It enables ingestion for all mapped stores after the cutoff.

   ```sql
   update public.hike_sync_settings
   set enabled = true,
       live_mode = true,
       sales_cutoff = now(),
       last_successful_sync = null
   where id = 1
   returning enabled, live_mode, sales_cutoff, last_successful_sync;
   ```

3. Complete the Hike sale. In GitHub, go to **Actions → Hike sales sync → Run workflow** to import immediately, or wait for the next scheduled run. Check the workflow response. A sale already completed before the cutoff will not be picked up by this test.
4. In Feldryva, open **Pending Color Confirmation** from the menu. Pick the exact color and verify that the quantity at the selling store drops by the number sold. Re-run the workflow to check the sale is processed only once. If the sale is held for a reason other than color, look under **Hike Review**.
5. When finished, pause Hike while replacing temporary quantities with the actual opening count.

   ```sql
   update public.hike_sync_settings
   set enabled = false, live_mode = false
   where id = 1;
   ```

   When ready for real operations, set a fresh cutoff aligned to the opening count, clear the checkpoint, and enable both switches as above. The opening count must reflect sales before the cutoff. Leave Locally disabled until its separate activation is ready.

## Catalog and receiving

**Shoe Catalog → Remove Verification** hides the model from approved receiving. **Verify Again** restores it. Previously received stock and Hike catalog mappings are kept. **Hike Review** shows live unresolved sales and filters out earlier test imports.
