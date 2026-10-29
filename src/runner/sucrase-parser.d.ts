// Sucrase는 파서를 패키지 진입점으로 내보내지 않는다. 타입은 dist/types에 있다.
declare module 'sucrase/dist/parser' {
  export * from 'sucrase/dist/types/parser/index';
}
declare module 'sucrase/dist/parser/tokenizer/types' {
  export * from 'sucrase/dist/types/parser/tokenizer/types';
}
