import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api';
import { PLATFORM_SCHOOLS_KEY } from '../queries';

export function useSchoolOptions() {
  const api = useApi();
  return useQuery({
    queryKey: [...PLATFORM_SCHOOLS_KEY, 'options'],
    queryFn: async () => {
      const { items } = await api.platform.schools.options({});
      return items;
    },
  });
}
