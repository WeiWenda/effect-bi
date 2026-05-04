import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { lineageAPI, LineageEntity } from '../services/lineageApi';
import {
  lineageEntityRouteTableName,
  lineageTableDescription,
  lineageTableDisplayName,
  lineageTableLayer,
} from '../services/lineageNodeMeta';

interface SearchResult {
  id: string;
  /** 展示用（可含 catalog / database 限定） */
  name: string;
  /** 与 GET /lineage/entity?tableName= 一致，优先 Neo4j `table_name` */
  routeTableName: string;
  description: string;
  layer: string;
}

function Lineage(): React.JSX.Element {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [topTables, setTopTables] = useState<SearchResult[]>([]);

  // Fetch top tables by degree on mount
  useEffect(() => {
    const fetchTopTables = async () => {
      try {
        const response = await lineageAPI.getTopTablesByDegree(3);
        const tables: SearchResult[] = response.entities.map((entity: LineageEntity) => ({
          id: entity.id,
          name: lineageTableDisplayName(entity.properties),
          routeTableName: lineageEntityRouteTableName(entity.properties),
          description: lineageTableDescription(entity.properties),
          layer: lineageTableLayer(entity.properties),
        }));
        setTopTables(tables);
      } catch (error) {
        console.error('Error fetching top tables:', error);
      }
    };
    fetchTopTables();
  }, []);

  // Debounced search for suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        try {
          const response = await lineageAPI.searchEntities(searchQuery, 5);
          const names = response.entities
            .map((entity: LineageEntity) => entity.properties.name || entity.properties.table_name || '')
            .filter((name: string) => name && name.toLowerCase().includes(searchQuery.toLowerCase()));
          setSuggestions(names);
          setShowSuggestions(true);
        } catch (error) {
          console.error('Error fetching suggestions:', error);
          setSuggestions([]);
        }
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSearch = async (query: string): Promise<void> => {
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);
    setShowSuggestions(false);

    try {
      const response = await lineageAPI.searchEntities(query, 100);
      const results: SearchResult[] = response.entities.map((entity: LineageEntity) => ({
        id: entity.id,
        name: lineageTableDisplayName(entity.properties),
        routeTableName: lineageEntityRouteTableName(entity.properties),
        description: lineageTableDescription(entity.properties),
        layer: lineageTableLayer(entity.properties),
      }));

      setTotalResults(results.length);
      setSearchResults(results);
      setCurrentPage(1);
    } catch (error) {
      console.error('Error searching entities:', error);
      setSearchResults([]);
      setTotalResults(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  const handleSuggestionClick = (suggestion: string): void => {
    setSearchQuery(suggestion);
    setShowSuggestions(false);
    handleSearch(suggestion);
  };

  const paginatedResults = searchResults.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const totalPages = Math.ceil(totalResults / pageSize);

  return (
    <div className="h-full flex flex-col bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto w-full">
        {/* Search Section */}
        <div className="mb-8">
          <form onSubmit={handleSubmit} className="relative">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                placeholder="搜索表名、描述..."
                className="w-full pl-12 pr-4 py-4 rounded-xl border border-gray-200 bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
              />
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg border border-gray-200 shadow-lg z-10 max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-3 cursor-pointer hover:bg-gray-50 text-gray-700 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {suggestion}
                  </div>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="size-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
          </div>
        )}

        {/* Empty State */}
        {!hasSearched && !loading && (
          <>
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <SearchIcon className="size-16 mb-4 text-gray-300" />
              <p className="text-lg">输入关键词搜索血缘数据</p>
              <p className="text-sm mt-2">暂停输入 1 秒后将显示搜索建议</p>
            </div>

            {/* Top Tables Cards */}
            {topTables.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-gray-700 mb-4">热门数据表</h3>
                <div className="grid grid-cols-3 gap-4">
                  {topTables.map((table) => (
                    <div
                      key={table.id}
                      onClick={() => navigate(`/lineage/table/${encodeURIComponent(table.routeTableName)}`)}
                      className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="p-2 bg-blue-50 rounded-lg shrink-0">
                          <SearchIcon className="size-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-gray-800 truncate">{table.name}</h4>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                            {table.layer}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">{table.description || '暂无描述'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* No Results */}
        {hasSearched && !loading && searchResults.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <SearchIcon className="size-16 mb-4 text-gray-300" />
            <p className="text-lg">未找到匹配的结果</p>
          </div>
        )}

        {/* Results Table */}
        {hasSearched && !loading && searchResults.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">表名</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">表描述</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">所在分层</th>
                </tr>
              </thead>
              <tbody>
                {paginatedResults.map((result) => (
                  <tr
                    key={result.id}
                    onClick={() => navigate(`/lineage/table/${encodeURIComponent(result.routeTableName)}`)}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-gray-800 font-medium">{result.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{result.description || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{result.layer}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
                <div className="text-sm text-gray-600">
                  共 {totalResults} 条结果，第 {currentPage} / {totalPages} 页
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeftIcon className="size-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRightIcon className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Lineage;
