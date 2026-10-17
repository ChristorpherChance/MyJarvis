/** Preserve the original draft/CAS while a still-editable record changes in the background. */
export function memoryEditorRefresh(modal:string,selectedId:string,records:{id:string;status:string}[]):'preserve'|'clear'{
 if(modal==='add'||modal==='policy')return 'preserve';
 return modal==='edit'&&records.some(record=>record.id===selectedId&&['active','candidate'].includes(record.status))?'preserve':'clear';
}
