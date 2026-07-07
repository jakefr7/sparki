import { paginatedSearchQuerySchema } from '../../common/paginated-search-query.schema';

export const searchClientsQuerySchema = paginatedSearchQuerySchema;

export type SearchClientsQuery = ReturnType<typeof searchClientsQuerySchema.parse>;
