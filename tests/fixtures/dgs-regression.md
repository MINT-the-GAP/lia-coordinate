<!--
language: de
import: ../../README.md
-->

# Regression-DGS

## Regression ohne explizites DGS

@Koordinatensystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=520;id=reg_only`)

@Regression(`reg_only`)

## Rekonstruktion ohne explizites DGS

@Koordinatensystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=520;id=recon_only`)

@Reconstruction(`recon_only;2x-1;0.1`)

## Regression vor explizitem DGS

@Koordinatensystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=520;id=reg_before_dgs`)

@Regression(`reg_before_dgs`)

@DGS(`reg_before_dgs;tools=[200;510];restrictions=[200;300;400]`)

## Explizites DGS vor Regression

@Koordinatensystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=520;id=dgs_before_reg`)

@DGS(`dgs_before_reg;tools=[200;510];restrictions=[200;300;400]`)

@Regression(`dgs_before_reg`)

## Explizite Auswahl einzelner Regression-Werkzeuge

@Koordinatensystem(`xmin=-4;xmax=4;ymin=-3;ymax=3;width=520;id=partial_reg`)

@DGS(`partial_reg;tools=[910;920];restrictions=[400]`)

@Regression(`partial_reg`)
