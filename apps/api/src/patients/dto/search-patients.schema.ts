import { paginatedSearchQuerySchema } from '../../common/paginated-search-query.schema';

export const searchPatientsQuerySchema = paginatedSearchQuerySchema;

export type SearchPatientsQuery = ReturnType<typeof searchPatientsQuerySchema.parse>;
