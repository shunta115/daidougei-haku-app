import { describe,it,expect } from 'vitest'
import { PDFDocument,PDFName,PDFString } from 'pdf-lib'
import { validatePdf } from '../server/officialHome'
import { cleanDetails,validateBooking } from '../shared/officialHome'
const valid={performer_id:'10000000-0000-4000-8000-000000000001',organization:'TEST',contact:'TEST',email:'test@example.invalid',phone:'090-0000-0000',date:'2099-10-31',venue:'TEST会場',event:'テストイベント',duration:'30分',budget:'相談',notes:''}
describe('booking and profile validation',()=>{
 it('validates all required fields and normalizes text',()=>{expect(validateBooking(valid)).toEqual(valid);expect(cleanDetails({tagline:' hello ',untrusted:'bad'})).toEqual({tagline:'hello'})})
 it('rejects email, dates, oversized and missing fields',()=>{for(const patch of [{email:'bad'},{date:'2020-01-01'},{date:'2099-02-30'},{event:'x'.repeat(4001)},{contact:''},{phone:'abc'}])expect(()=>validateBooking({...valid,...patch})).toThrow()})
})
describe('PDF content validation',()=>{
 it('accepts an actual generated PDF',async()=>{const doc=await PDFDocument.create();doc.addPage();await expect(validatePdf(await doc.save())).resolves.toBeUndefined()})
 it('rejects fake, malformed and truncated files',async()=>{for(const value of ['<html>bad</html>','%PDF-1.7\n%%EOF','%PDF-1.7 invalid'])await expect(validatePdf(Buffer.from(value))).rejects.toThrow()})
 it('rejects active JavaScript content through decoded PDF names',async()=>{const doc=await PDFDocument.create();doc.addPage();doc.catalog.set(PDFName.of('OpenAction'),doc.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('alert(1)')}));await expect(validatePdf(await doc.save())).rejects.toThrow()})
 it('rejects forms and excessive page counts',async()=>{const doc=await PDFDocument.create();doc.addPage();doc.getForm().createTextField('test');await expect(validatePdf(await doc.save())).rejects.toThrow();const big=await PDFDocument.create();for(let i=0;i<101;i++)big.addPage();await expect(validatePdf(await big.save())).rejects.toThrow()})
})
