import AbstractDriver from '@sqltools/base-driver'
import queries from './queries'
import { AS400Queries, CustomQueries } from './queries'
import {
    IConnectionDriver,
    MConnectionExplorer,
    NSDatabase,
    ContextValue,
    Arg0,
    IBaseQueries,
} from '@sqltools/types'
import { v4 as generateId } from 'uuid'

/**
 * set Driver lib to the type of your connection.
 * Eg for postgres:
 * import { Pool, PoolConfig } from 'pg';
 * ...
 * type DriverLib = Pool;
 * type DriverOptions = PoolConfig;
 *
 * This will give you completions inside of the library
 */
type DriverLib = any // Pool
type DriverOptions = any // PoolParameters


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

    private get customQuery():IBaseQueries {
        switch (this.credentials.dbType) {
            case "ibm iSeries (AS400)":
                return new AS400Queries()
            default:
                return new CustomQueries()
        }
    }

    queries = queries
    /**
     *
     */
    

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
            const { connect } = this.lib
            const conn = connect(this.createConnectionString())
    
            /**
             * open your connection here!!!
             */
    
            // this.connection = fakeDbLib.open()
            this.connection = conn
            return Promise.resolve(conn)
        } catch (err) {
            console.log(err)
            throw(err)
        }
    }

    public async close() {
        if (!this.connection) return Promise.resolve()
        /**
         * cose you connection here!!
         */
        const conn = await this.connection // as odbc.Connection
        conn.close()
        this.connection = null
    }

    public query: typeof AbstractDriver['prototype']['query'] = async (
        queries,
        opt = {}
    ) => {
        const db = await this.open() // as odbc.Connection
        // hopefully this works: https://stackoverflow.com/questions/24423260/split-sql-statements-in-php-on-semicolons-but-not-inside-quotes
        const regex = /((?:[^;'"]*(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*')[^;'"]*)+)|;/
        const splittedQueries = queries.toString().split(regex).filter(Boolean) // <- maybe check Regex again
        const resultsAgg: NSDatabase.IResult[] = []
        for (const q of splittedQueries)  {
            let result = null
            let message = ""
            try {
                const res = await db.query(q)
                result = res
                message = `Query ok with ${result.length} results`
            } catch(ex) {
                message = `Execution failed with: ${ex}`
            }

            resultsAgg.push({
                cols: result?.columns?.map(col => col.name) || [],
                connId: this.getId(),
                messages: [
                    {
                        date: new Date(),
                        message,
                    },
                ],
                // trim ??
                results: result ?? [],
                query: q,
                requestId: opt.requestId,
                resultId: generateId(),
            })
        }
        /**
         * write the method to execute queries here!!
         */
        return resultsAgg
    }

    /** if you need a different way to test your connection, you can set it here.
     * Otherwise by default we open and close the connection only
     */
    public async testConnection() {
        await this.open()
        // await this.query('SELECT 1', {}) <- doesn't work with as400
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
        switch (item.type) {
            case ContextValue.CONNECTION:
            case ContextValue.CONNECTED_CONNECTION:
                // return <MConnectionExplorer.IChildItem[]>[
                //     { label: 'Databases', 'type': ContextValue.DATABASE, iconId: 'folder', childType: ContextValue.TABLE }
                // ]
            case ContextValue.DATABASE:{
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
     * This method is a helper to generate the connection explorer tree.
     * It gets the child based on child types
     */
    // private async getChildrenForGroup({
    //     parent,
    //     item,
    // }: Arg0<IConnectionDriver['getChildrenForItem']>) {
    //     console.log({ item, parent })
    //     switch (item.childType) {
    //         case ContextValue.TABLE:
    //         case ContextValue.VIEW:
    //             let i = 0
             
    //             return <MConnectionExplorer.IChildItem[]>[
    //                 {
    //                     database: 'fakedb',
    //                     label: `${item.childType}${i++}`,
    //                     type: item.childType,
    //                     schema: 'fakeschema',
    //                     childType: ContextValue.COLUMN,
    //                 },
    //                 {
    //                     database: 'fakedb',
    //                     label: `${item.childType}${i++}`,
    //                     type: item.childType,
    //                     schema: 'fakeschema',
    //                     childType: ContextValue.COLUMN,
    //                 },
    //                 {
    //                     database: 'fakedb',
    //                     label: `${item.childType}${i++}`,
    //                     type: item.childType,
    //                     schema: 'fakeschema',
    //                     childType: ContextValue.COLUMN,
    //                 },
    //             ]
    //     }
    //     return []
    // }

    /**
     * This method is a helper for intellisense and quick picks.
     */
    public async searchItems(
        itemType: ContextValue,
        search: string,
        _extraParams: any = {}
    ): Promise<NSDatabase.SearchableItem[]> {
        switch (itemType) {
            case ContextValue.TABLE:
            case ContextValue.VIEW:
                let j = 0
                return [
                    {
                        database: 'fakedb',
                        label: `${search || 'table'}${j++}`,
                        type: itemType,
                        schema: 'fakeschema',
                        childType: ContextValue.COLUMN,
                    },
                    {
                        database: 'fakedb',
                        label: `${search || 'table'}${j++}`,
                        type: itemType,
                        schema: 'fakeschema',
                        childType: ContextValue.COLUMN,
                    },
                    {
                        database: 'fakedb',
                        label: `${search || 'table'}${j++}`,
                        type: itemType,
                        schema: 'fakeschema',
                        childType: ContextValue.COLUMN,
                    },
                ]
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
                    },
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
                    },
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
                    },
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
                    },
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
                    },
                ]
        }
        return []
    }

    getSqlDataType(typeCode:number) {
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
