import AbstractDriver from '@sqltools/base-driver'
import queries, { MSSQLQueries } from './queries'
import { AS400Queries, CustomQueries } from './queries'
import {
    IConnectionDriver,
    MConnectionExplorer,
    NSDatabase,
    ContextValue,
    Arg0,
} from '@sqltools/types'
import { v4 as generateId } from 'uuid'
import { Pool, PoolParameters, Result } from 'odbc'

type DriverLib = Pool // Pool
type DriverOptions = PoolParameters // PoolParameters


export default class OdbcDriver
    extends AbstractDriver<DriverLib, DriverOptions>
    implements IConnectionDriver {
    /**
     * If you driver depends on node packages, list it below on `deps` prop.
     * It will be installed automatically on first use of your driver.
     */
    public readonly deps: typeof AbstractDriver.prototype['deps'] = [
        {
            type: AbstractDriver.CONSTANTS.DEPENDENCY_PACKAGE,
            name: 'odbc',
            version: '2.4.9',
        },
    ]

    private get customQuery(): CustomQueries {
        switch (this.credentials.dbType) {
            case "ibm iSeries (AS400)":
                return new AS400Queries()
            case "Microsoft SQL Server":
                return new MSSQLQueries()
            default:
                return new CustomQueries()
        }
    }

    queries = queries

    /** if you need to require your lib in runtime and then
     * use `this.lib.methodName()` anywhere and vscode will take care of the dependencies
     * to be installed on a cache folder
     **/
    private get lib() {
        return this.requireDep('odbc') as typeof import("odbc");
    }

    createConnectionString() {
        if (this.credentials.connectionString) {
            return this.credentials.connectionString
        }
        throw new Error("not implemented 1")
    }

    public async open() {
        if (this.connection) {
            return this.connection
        }
        try {
            const { pool } = this.lib
            // const dbPool = await pool(this.createConnectionString())
            const dbPool = pool(this.createConnectionString())
            /**
             * open your connection here!!!
             */

            // this.connection = fakeDbLib.open()
            // this.connection = Promise.resolve(dbPool)
            // return Promise.resolve(dbPool)
            this.connection = dbPool
            return dbPool
        } catch (err) {
            throw (err)
        }
    }

    public async close() {
        if (!this.connection) return Promise.resolve()
        await (await this.connection).close()
        this.connection = null
    }

    getRowDelimiter() {
        const delim = this.credentials.previewLimit
        if (!delim || !Number.isInteger(delim)) return ""
        return this.customQuery.getRowDelimiterSuffix(delim)
    }

    public query: typeof AbstractDriver['prototype']['query'] = async (
        queries,
        opt = {}
    ) => {
        const pool = await this.open()
        const conn = await pool.connect()
        // hopefully this works: https://stackoverflow.com/questions/24423260/split-sql-statements-in-php-on-semicolons-but-not-inside-quotes
        const regex = /((?:[^;'"]*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*')[^;'"]*)+)|;/
        const splittedQueries = queries.toString().split(regex).filter(Boolean)
        const resultsAgg: NSDatabase.IResult[] = []
        for (let q of splittedQueries) {
            let result: Result<unknown> = null
            let message = ""
            let exception = null
            if (this.failOnDeleteUpdateWithoutWhere(q)) {
                message = "Updates Or Deletes not allowed without where clause"
                resultsAgg.push(this.getFailRes(message, opt.requestId, q))
                continue
            }
            try {
                const res = await conn.query(q + this.getRowDelimiter())
                result = res
                message = `Query ok with ${res.count} results`
            } catch (ex) {
                message = `Execution failed with: ${ex}`
                exception = ex
                console.warn(ex)
                throw ex
            }
            resultsAgg.push({
                cols: result?.columns?.map((col:any) => col.name) || [],
                connId: this.getId(),
                messages: [
                    {
                        date: new Date(),
                        message,
                    },
                ],
                results: this.trimResultsIfWanted(result),
                query: q,
                error: exception != null,
                rawError: exception,
                requestId: opt.requestId,
                resultId: generateId(),
            })
        }

        return resultsAgg
    }

    getFailRes(message:string, rqId: string, rq: string) {
        return {
            resultId: generateId(), 
            requestId: rqId, 
            connId: this.getId(), 
            query: rq, 
            results:[ ], 
            cols:[], 
            messages: [{
                date: new Date(), 
                message: message
            }]
        }
    }

    trimResultsIfWanted(results : Result<unknown>) {
        if (!results) return []
        console.log(this.credentials.trimResult)
        if (!this.credentials.trimResult) return results
        const cols = results.columns.filter(col => this.isTypeOfString(col.dataType)).map(col => col.name)
        return results.map((el) => {
            for (const col of cols) {
                el[col] = el[col].trim()
            }
            return el
        })
    }

    failOnDeleteUpdateWithoutWhere(q:string) {
        if (!this.credentials.restrictUpdate) {
            return true;
        }
        const query = q.trim().toLowerCase()
        if (query.startsWith('update') || query.startsWith('delete')) {
            return query.includes('where')
        }
        return true
    }

    public async testConnection() {
        const pool = await this.open()
        const conn = await pool.connect()
        await conn.close()
        await this.close()
    }

    /**
     * This method is a helper to generate the connection explorer tree.
     * it gets the child items based on current item
     */
    public async getChildrenForItem({
        item,
        //parent,
    }: Arg0<IConnectionDriver['getChildrenForItem']>) {
        console.log('item', item)
        switch (item.type) {
            case ContextValue.CONNECTION:
            case ContextValue.CONNECTED_CONNECTION:
            // return <MConnectionExplorer.IChildItem[]>[
            //     { label: 'Databases', 'type': ContextValue.DATABASE, iconId: 'folder', childType: ContextValue.TABLE }
            // ]
            case ContextValue.DATABASE: {
                const query = this.customQuery.fetchDatabases()
                if (!query) return []
                const results = await this.queryResults(query)
                return results.map((schema) => ({
                    label: schema['DATABASE'],
                    database: schema['DATABASE'],
                    schema: schema['DATABASE'],
                    type: ContextValue.SCHEMA,
                    iconId: 'folder',
                    // childType: ContextValue.TABLE // <- WTF ?? What this for
                }))
            }
            case ContextValue.TABLE:
            case ContextValue.VIEW: {
                const query = this.customQuery.fetchColumns(item as NSDatabase.ITable)
                if (!query) return []
                const results = await this.queryResults(query)
                console.log(results)
                return <NSDatabase.IColumn[]>results.map(res => ({
                    database: item.database,
                    table: item.label,
                    label: res['COLUMN_NAME'],
                    dataType: res['DATA_TYPE'],
                    type: ContextValue.COLUMN,
                }))
            }
            case ContextValue.SCHEMA: {
                const query = this.customQuery.fetchTables(item as NSDatabase.ISchema)
                if (!query) return []
                const results = await this.queryResults(query)
                return <MConnectionExplorer.IChildItem[]>results.map(res => ({
                    database: item.label,
                    label: res['TABLE_NAME'],
                    type: ContextValue.TABLE,
                    iconId: 'table'
                }))
            }
        }
        return []
    }

    /**
     * This method is a helper for intellisense and quick picks.
     */
    public async searchItems(
        itemType: ContextValue,
        search: string,
        _extraParams: any = {}
    ): Promise<NSDatabase.SearchableItem[]> {
        console.log(itemType)
        console.log('s', search)
        console.log('e', _extraParams)
        switch (itemType) {
            case ContextValue.TABLE:
            case ContextValue.VIEW:
                const query = this.customQuery.searchTables({ search, ..._extraParams })
                console.log(query)
                if (!query) return []
                const results = await this.queryResults(query)
                return results.map(r => ({
                    label: r['TABLE_NAME'] || r['TABLE_SCHEMA'],
                    database: _extraParams['database'], 
                    type: itemType,
                    schema: 'fakeschema',
                }))
            case ContextValue.COLUMN:
                let i = 0
                return [
                    {
                        database: 'fakedb',
                        label: `${search || 'column'}${i++}`,
                        type: ContextValue.COLUMN,
                        dataType: 'faketype',
                        schema: 'fakeschema',
                        childType: ContextValue.NO_CHILD,
                        isNullable: false,
                        iconName: 'column',
                        table: 'fakeTable',
                    }
                ]
        }
        return []
    }

    isTypeOfString(typeNum : number) {
        return ['-1', '1', '12', '-9', '-10', '-11'].includes(typeNum.toString())
    }

    getSqlDataType(typeCode: number) {
        const sqlDataTypes = {
            '-7': 'BIT',
            '-6': 'TINYINT',
            '-5': 'BIGINT',
            '-4': 'LONGVARBINARY',
            '-3': 'VARBINARY',
            '-2': 'BINARY',
            '-1': 'LONGVARCHAR',
            '0': 'NULL',
            '1': 'CHAR',
            '2': 'NUMERIC',
            '3': 'DECIMAL',
            '4': 'INTEGER',
            '5': 'SMALLINT',
            '6': 'FLOAT',
            '7': 'REAL',
            '8': 'DOUBLE',
            '9': 'DATE',
            '10': 'TIME',
            '11': 'TIMESTAMP',
            '12': 'VARCHAR',
            '-8': 'ROWID',
            '-9': 'WVARCHAR',
            '-10': 'WCHAR',
            '-11': 'WCHAR VAR'
        };

        return sqlDataTypes[typeCode.toString()] || 'UNKNOWN';
    }

    public getStaticCompletions: IConnectionDriver['getStaticCompletions'] = async () => {
        return {}
    }
}
