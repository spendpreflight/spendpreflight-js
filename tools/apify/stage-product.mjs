import {mkdirSync,copyFileSync,cpSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
export function stageProduct(product){
 if(!['lint','receipt','statement','token'].includes(product))throw Error('Fixed product required');
 const dir=join('.apify-build',product);if(existsSync(dir))throw Error('Staging directory already exists; inspect before rebuilding');
 mkdirSync(dir,{recursive:true});
 for(const file of ['package.json','package-lock.json','Dockerfile','.dockerignore'])copyFileSync('actors/paid-runtime/'+file,join(dir,file));
 cpSync('actors/paid-runtime/src',join(dir,'src'),{recursive:true});cpSync('actors/'+product+'/.actor',join(dir,'.actor'),{recursive:true});
 for(const file of ['README.md','config.json'])copyFileSync('actors/'+product+'/'+file,join(dir,file));
 return dir;
}
if(process.argv[1]?.endsWith('stage-product.mjs'))console.log(stageProduct(process.argv[2]));
