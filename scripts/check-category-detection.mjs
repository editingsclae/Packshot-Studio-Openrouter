import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';

const rootDir = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

function loadTsModule(relPath) {
  const fullPath = path.join(rootDir, relPath);
  const source = fs.readFileSync(fullPath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });

  const mod = { exports: {} };
  const wrapped = `(function(exports, require, module, __filename, __dirname) {\n${transpiled.outputText}\n})`;
  const compiled = vm.runInThisContext(wrapped, { filename: fullPath });
  compiled(mod.exports, require, mod, fullPath, path.dirname(fullPath));
  return mod.exports;
}

const { detectCategoryFromName } = loadTsModule('lib/presets.ts');

const requiredCases = [
  ['Coffee Beans 1kg', 'food-beverage'],
  ['Espresso Machine', 'kitchen-dining'],
  ['Matte Black Kettle', 'kitchen-dining'],
  ['Cupcake Box', 'bottles-packaging'],
];

const kitchenCoffeePhraseCases = [
  ['Drip Coffee Maker', 'kitchen-dining'],
  ['Automatic Coffee Machine', 'kitchen-dining'],
  ['Burr Coffee Grinder', 'kitchen-dining'],
  ['Glass Coffee Pot', 'kitchen-dining'],
  ['Dual-Boiler Espresso Machine', 'kitchen-dining'],
  ['Borosilicate French Press', 'kitchen-dining'],
  ['Aluminum Moka Pot', 'kitchen-dining'],
  ['Stoneware Coffee Mug', 'kitchen-dining'],
  ['Stainless Steel Saucepan', 'kitchen-dining'],
];

const priorityFoodCases = [
  ['Whole Coffee Beans', 'food-beverage'],
  ['Ground Sumatra Coffee', 'food-beverage'],
  ['Dark Roast Coffee', 'food-beverage'],
  ['Roasted Almond Snack', 'food-beverage'],
  ['Espresso Capsules', 'food-beverage'],
  ['Compostable Coffee Pods', 'food-beverage'],
  ['Chamomile Tea Bags', 'food-beverage'],
  ['Instant Matcha', 'food-beverage'],
  ['Chili Crisp Sauce', 'food-beverage'],
  ['Cacao Powder', 'food-beverage'],
  ['Vanilla Syrup', 'food-beverage'],
];

const headNounCases = [
  ['Instant Camera', 'electronics'],
  ['Instant Pot Pressure Cooker', 'kitchen-dining'],
  ['Loose Face Powder Compact', 'beauty-skincare'],
  ['Non-stick Sauce Pan', 'kitchen-dining'],
  ['Snack Bowl', 'kitchen-dining'],
  ['Pods Wireless Earbuds', 'electronics'],
  ['Ground Control Backpack', 'bags-accessories'],
  ['Hot Sauce Bottle', 'bottles-packaging'],
  ['Protein Powder 2kg', 'food-beverage'],
  ['Ground Coffee 500g', 'food-beverage'],
  ['Maple Syrup', 'food-beverage'],
  ['Cast Iron Skillet Large', 'kitchen-dining'],
  ['Seasoned Carbon Steel Wok 3pcs', 'kitchen-dining'],
  ['Leather Tote', 'bags-accessories'],
  ['Minimalist Bi-Fold Wallet', 'bags-accessories'],
  ['Velvet Eyeshadow Palette', 'beauty-skincare'],
  ['Matte Lipstick', 'beauty-skincare'],
  ['Volumizing Mascara', 'beauty-skincare'],
  ['Studio Wireless Earphones', 'electronics'],
  ['Portable Bluetooth Speaker', 'electronics'],
  ['Coffee Mug Ceramic', 'kitchen-dining'],
  ['Ceramic Plant Pot', 'home-furniture'],
  ['Terracotta Flower Pot', 'home-furniture'],
  ['Large Garden Pot Brushed Metal', 'home-furniture'],
  ['Water Bottle Stainless Steel', 'bottles-packaging'],
  ['Pour-Over Kettle Matte Black', 'kitchen-dining'],
];

const allCases = [
  ...requiredCases,
  ...kitchenCoffeePhraseCases,
  ...priorityFoodCases,
  ...headNounCases,
];

for (const [name, expected] of allCases) {
  const actual = detectCategoryFromName(name);
  assert.strictEqual(
    actual,
    expected,
    `Expected "${name}" -> "${expected}", got "${actual}"`
  );
}

console.log(`Category detection check passed: ${allCases.length} cases verified.`);
