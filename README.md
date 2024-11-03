[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# <img src="https://github.com/tobi187/SqlTools-Odbc/blob/master/icons/db-orange.png?raw=true"  style="height:1em;"/> Odbc Connection for SQLTools

Connect to your favorite Database with the Power of ODBC

## Install

Install from the [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=tobi187.sqltools-odbc).

## Features

- **Connect** to your favorite Database
- **Run queries**
- **Explore DB** tables and columns in the sidebar
- **View** table results by selecting them in the sidebar

Because the internal Structure of different Databases is vastly different the Sidebar View has to be implemented manually for every Database essentially. This means the Sidebar explorer works only for supported Databases. If you need Support for a new Database just open an Issue in the Repository and I'll try to implement it. In unsupported Databases the Querying should still work maybe <br><br>
**Currently Supported Databases**
- IBM iSeries AS400 (iSeries Access ODBC Driver)

## Connecting To a Database

![alt text](https://github.com/tobi187/SqlTools-Odbc/blob/master/assets/image.png?raw=true)

Currently only Connection Strings are supported, because i don't know if different Odbc Connections require a different format / different Parameters in their Connection String

## Known Limitations

- Db Explorer only works for supported Dbs
- Mssql
  - Selects for Tables with Varchar(max) + Varbinary(max) only works when these Columns are at the end. [Look here](https://github.com/r-dbi/odbc/issues/10)

## Contributing

- If you encounter bugs or have feature requests, feel free to open an issue.
- PRs welcome
