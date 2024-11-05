import { IBaseQueries, ContextValue, NSDatabase, QueryBuilder } from '@sqltools/types';
import queryFactory from '@sqltools/base-driver/dist/lib/factory';

class CustomQueries implements IBaseQueries {
  [id: string]: string | ((params: any) => (string | import("@sqltools/types").IExpectedResult))
  fetchRecords: QueryBuilder<{ limit: number; offset: number; table: NSDatabase.ITable; }, any> = queryFactory``;
  countRecords: QueryBuilder<{ table: NSDatabase.ITable; }, { total: number; }> = queryFactory``;
  fetchSchemas?: QueryBuilder<NSDatabase.IDatabase, NSDatabase.ISchema> = queryFactory``;
  fetchDatabases?: QueryBuilder<never, NSDatabase.IDatabase> = queryFactory``;
  fetchTables: QueryBuilder<NSDatabase.ISchema, NSDatabase.ITable> = queryFactory``;
  searchTables: QueryBuilder<{ search: string; limit?: number; }, NSDatabase.ITable> = queryFactory``;
  searchColumns: QueryBuilder<{ search: string; tables: NSDatabase.ITable[]; limit?: number; }, NSDatabase.IColumn> = queryFactory``;
  describeTable: QueryBuilder<NSDatabase.ITable, any> = queryFactory``;
  fetchColumns: QueryBuilder<NSDatabase.ITable, NSDatabase.IColumn> = queryFactory``;
  fetchFunctions?: QueryBuilder<NSDatabase.ISchema, NSDatabase.IFunction> = queryFactory``;
  getRowDelimiterSuffix(num:number) : string { return num ? "" : "" } // no unused num ts error
} 

class AS400Queries extends CustomQueries {
  fetchDatabases?: QueryBuilder<never, NSDatabase.IDatabase> = queryFactory`
    select distinct TABLE_SCHEMA as DATABASE from QSYS2.SYSTABLES where (table_type = 'T' or table_type = 'P') 
  `
  fetchTables: QueryBuilder<NSDatabase.ISchema, NSDatabase.ITable> = queryFactory`
    select distinct TABLE_NAME from QSYS2.SYSTABLES where table_schema = '${(p => p.label)}'
  `
  fetchColumns: QueryBuilder<NSDatabase.ITable, NSDatabase.IColumn> = queryFactory`
    select COLUMN_NAME, DATA_TYPE from QSYS2.syscolumns where 
    table_schema = '${(p => p.database)}' and table_name = '${p => p.label}' 
  `
  searchTables: QueryBuilder<{ search: string; limit?: number; }, NSDatabase.ITable> = queryFactory`
    select distinct ${(p => p.database ? 'TABLE_NAME' : 'TABLE_SCHEMA')} from QSYS2.SYSTABLES where (table_type = 'T' or table_type = 'P') 
    and ${(p => p.database 
      ? " table_schema = '" + p.database.toUpperCase() + "' and table_name LIKE '"+ (p.search?.toUpperCase() || '') + "%'"
      : " table_schema LIKE '" + (p.search?.toUpperCase() || '') + "%'"
    )}
  `;
  
  getRowDelimiterSuffix(num: number): string {
    return ` fetch first ${num} rows only`
  }
}

class MSSQLQueries extends CustomQueries {
  fetchDatabases?: QueryBuilder<never, NSDatabase.IDatabase> = queryFactory`
    select distinct name as [DATABASE] from master.dbo.sysdatabases
  `
  fetchTables: QueryBuilder<NSDatabase.ISchema, NSDatabase.ITable> = queryFactory`
    select distinct TABLE_NAME from ${(p => p.label)}.INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_CATALOG='${(p => p.label)}'
  `
  fetchColumns: QueryBuilder<NSDatabase.ITable, NSDatabase.IColumn> = queryFactory`
    select COLUMN_NAME, DATA_TYPE FROM ${(p => p.database)}.INFORMATION_SCHEMA.COLUMNS where 
    table_name = N'${p => p.label}' 
  `
}

const describeTable: IBaseQueries['describeTable'] = queryFactory`
  SELECT C.*
  FROM pragma_table_info('${p => p.label}') AS C
  ORDER BY C.cid ASC
`;

const fetchColumns: IBaseQueries['fetchColumns'] = queryFactory`
SELECT C.name AS label,
  C.*,
  C.type AS dataType,
  C."notnull" AS isNullable,
  C.pk AS isPk,
  '${ContextValue.COLUMN}' as type
FROM pragma_table_info('${p => p.label}') AS C
ORDER BY cid ASC
`;

const fetchRecords: IBaseQueries['fetchRecords'] = queryFactory`
SELECT *
FROM ${p => (p.table.label || p.table)}
LIMIT ${p => p.limit || 50}
OFFSET ${p => p.offset || 0};
`;

const countRecords: IBaseQueries['countRecords'] = queryFactory`
SELECT count(1) AS total
FROM ${p => (p.table.label || p.table)};
`;

const fetchTablesAndViews = (type: ContextValue, tableType = 'table'): IBaseQueries['fetchTables'] => queryFactory`
SELECT name AS label,
  '${type}' AS type
FROM sqlite_master
WHERE LOWER(type) LIKE '${tableType.toLowerCase()}'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name
`;

const fetchTables: IBaseQueries['fetchTables'] = fetchTablesAndViews(ContextValue.TABLE);
const fetchViews: IBaseQueries['fetchTables'] = fetchTablesAndViews(ContextValue.VIEW , 'view');

const searchTables: IBaseQueries['searchTables'] = queryFactory`
SELECT name AS label,
  type
FROM sqlite_master
${p => p.search ? `WHERE LOWER(name) LIKE '%${p.search.toLowerCase()}%'` : ''}
ORDER BY name
`;
const searchColumns: IBaseQueries['searchColumns'] = queryFactory`
SELECT C.name AS label,
  T.name AS "table",
  C.type AS dataType,
  C."notnull" AS isNullable,
  C.pk AS isPk,
  '${ContextValue.COLUMN}' as type
FROM sqlite_master AS T
LEFT OUTER JOIN pragma_table_info((T.name)) AS C ON 1 = 1
WHERE 1 = 1
${p => p.tables.filter(t => !!t.label).length
  ? `AND LOWER(T.name) IN (${p.tables.filter(t => !!t.label).map(t => `'${t.label}'`.toLowerCase()).join(', ')})`
  : ''
}
${p => p.search
  ? `AND (
    LOWER(T.name || '.' || C.name) LIKE '%${p.search.toLowerCase()}%'
    OR LOWER(C.name) LIKE '%${p.search.toLowerCase()}%'
  )`
  : ''
}
ORDER BY C.name ASC,
  C.cid ASC
LIMIT ${p => p.limit || 100}
`;

export default {
  describeTable,
  countRecords,
  fetchColumns,
  fetchRecords,
  fetchTables,
  fetchViews,
  searchTables,
  searchColumns
}

export {
  CustomQueries,
  AS400Queries,
  MSSQLQueries
}