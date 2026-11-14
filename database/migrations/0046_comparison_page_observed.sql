ALTER TABLE shopping_comparison_quotes DROP CONSTRAINT shopping_comparison_quotes_basis_check;
ALTER TABLE shopping_comparison_quotes ADD CONSTRAINT shopping_comparison_quotes_basis_check
 CHECK (basis IN ('search-reported','retailer-page-observed','merchant-verified'));
