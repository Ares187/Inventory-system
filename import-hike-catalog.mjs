
const BASE_URL = "http://localhost:3000";
const START_PAGE = 0;
const MAX_RETRIES = 3;
const DELAY_MS = 250;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function importPage(page) {
  const url = `${BASE_URL}/api/hike/import-products?page=${page}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60000),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.details ||
          result.error ||
          `HTTP ${response.status}`
        );
      }

      return result;
    } catch (error) {
      console.error(
        `Page ${page}, attempt ${attempt}: ${error.message}`
      );

      if (attempt === MAX_RETRIES) {
        throw error;
      }

      await sleep(2000 * attempt);
    }
  }
}

async function main() {
  let page = START_PAGE;
  let totalProducts = 0;
  let totalVariants = 0;

  console.log("Starting Hike catalog import...");
  console.log(`Starting at page ${page}`);

  while (true) {
    let result;

    try {
      result = await importPage(page);
    } catch (error) {
      console.error(`Import stopped at page ${page}.`);
      console.error(
        `To resume, change START_PAGE to ${page}.`
      );
      process.exitCode = 1;
      return;
    }

    totalProducts += result.productsRetrieved;
    totalVariants += result.variantsIndexed;

    console.log(
      `Page ${page}: ${result.productsRetrieved} products, ` +
      `${result.variantsIndexed} variants indexed`
    );

    if (result.nextPage === null) {
      console.log("\nImport complete.");
      console.log(`Products processed: ${totalProducts}`);
      console.log(`Records indexed: ${totalVariants}`);
      return;
    }

    if (
      !Number.isSafeInteger(result.nextPage) ||
      result.nextPage <= page
    ) {
      throw new Error("Invalid next page returned by importer");
    }

    page = result.nextPage;
    await sleep(DELAY_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
