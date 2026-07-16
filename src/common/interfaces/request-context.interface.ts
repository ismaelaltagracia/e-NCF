export interface RequestContext {
  tipo: 'usuario' | 'api_key';
  empresa_id: string;
  rnc: string;
  usuario_id?: string;
  rol?: 'admin' | 'facturador' | 'lector' | 'super_admin';
  api_key_id?: string;
  scopes?: string[];
}
