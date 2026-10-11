import {publicListedCatalog} from './publicListedCatalog.mjs';
// Public instrument metadata only; no account, quantities, GAV or portfolio value.
export const publicCatalog=[
    ['Avanza Zero','SE0001718388','FUND','SEK'],['Kavaljer Quality Focus A SEK','LU1232457504','FUND','SEK'],
    ['Länsförsäkringar USA Index','SE0002793943','FUND','SEK'],['Spiltan Aktiefond Investmentbolag','SE0004297927','FUND','SEK'],
    ['Swedbank Robur Access Asien A','SE0007074117','FUND','SEK'],
].map(([name,isin,assetType,currency])=>({name,isin,instrumentId:`public-${isin}`,assetType,currency,identityVerified:true,platform:'Avanza'}))
    .concat(publicListedCatalog.map(listing=>({...listing,instrumentId:`public-${listing.isin}`,identityVerified:true,
        ...(listing.assetType==='STOCK'?{issuerListingReviewRequired:true}:{}),
        ...(listing.assetType==='SUBSCRIPTION_OPTION'?{lifecycleVerified:true,reviewRequiredFrom:'2027-05-10'}:{})})));
