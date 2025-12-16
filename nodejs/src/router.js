import duoduo from "./spider/video/duoduo.js";
import baseset from "./spider/video/baseset.js";
import mogg from "./spider/video/mogg.js";
import leijing from "./spider/video/leijing.js";
import panta from "./spider/video/panta.js";
import wogg from "./spider/video/wogg.js";
import zhizhen from "./spider/video/zhizhen.js";
import fenmei_live from "./spider/video/fenmei_live.js";
import syjc from "./spider/video/syjc.js";
import qq from "./spider/video/qq.js";
import iqiyi from "./spider/video/iqiyi.js";
import bili from "./spider/video/bili.js";
import symx from "./spider/video/symx.js";
import jianpian from "./spider/video/jianpian.js";
import jieyingshi from "./spider/video/jieyingshi.js";
import tgsou from "./spider/video/tgsou.js";
import tgchannel from "./spider/video/tgchannel.js";
import douban from "./spider/video/douban.js";
import push from "./spider/video/push.js";
import {getCache} from "./website/sites.js";
import {getCache as getDanmuSetting} from "./website/danmu.js";
import axios from "axios";
import { extractTitle, findEpisodeNumber } from './util/danmu-utils.js';

const spiders = [douban,duoduo,mogg,leijing,fenmei_live,syjc,qq,iqiyi,bili,symx,jianpian,jieyingshi,panta, wogg,zhizhen,tgchannel,tgsou,baseset,push];
const spiderPrefix = '/spider';

let danmuInfo = {};

/**
 * A function to initialize the router.
 *
 * @param {Object} fastify - The Fastify instance
 * @return {Promise<void>} - A Promise that resolves when the router is initialized
 */
export default async function router(fastify) {
    // register all spider router
    spiders.forEach((spider) => {
        const path = spiderPrefix + '/' + spider.meta.key + '/' + spider.meta.type;
        fastify.register(spider.api, { prefix: path });
        spider.check?.(fastify)
        console.log('Register spider: ' + path);
    });
    /**
     * @api {get} /check 检查
     */
    fastify.register(
        /**
         *
         * @param {import('fastify').FastifyInstance} fastify
         */
        async (fastify) => {
            fastify.get(
                '/check',
                /**
                 * check api alive or not
                 * @param {import('fastify').FastifyRequest} _request
                 * @param {import('fastify').FastifyReply} reply
                 */
                async function (_request, reply) {
                    reply.send({ run: !fastify.stop });
                }
            );
            const getConfig = () => {
                const config = {
                    video: {
                        sites: [],
                    },
                    read: {
                        sites: [],
                    },
                    comic: {
                        sites: [],
                    },
                    music: {
                        sites: [],
                    },
                    pan: {
                        sites: [],
                    },
                    color: fastify.config.color || [],
                };
                spiders.forEach((spider) => {
                    let meta = Object.assign({}, spider.meta);
                    meta.api = spiderPrefix + '/' + meta.key + '/' + meta.type;
                    meta.key = 'nodejs_' + meta.key;
                    const stype = spider.meta.type;
                    if (stype < 10) {
                        config.video.sites.push(meta);
                    } else if (stype >= 10 && stype < 20) {
                        config.read.sites.push(meta);
                    } else if (stype >= 20 && stype < 30) {
                        config.comic.sites.push(meta);
                    } else if (stype >= 30 && stype < 40) {
                        config.music.sites.push(meta);
                    } else if (stype >= 40 && stype < 50) {
                        config.pan.sites.push(meta);
                    }
                });
                return config
            }
            fastify.get(
                '/config',
                /**
                 * get catopen format config
                 * @param {import('fastify').FastifyRequest} _request
                 * @param {import('fastify').FastifyReply} reply
                 */
                async function (_request, reply) {
                    const config = getConfig()
                    const sites = await getCache(_request.server)

                    const allSites = config.video.sites
                    const visitedMap = {}
                    const allSitesMap = {}
                    allSites.forEach(site => {
                        allSitesMap[site.key] = site
                    })
                    // 旧的取出来 过滤掉已失效的
                    const rs =[]
                    sites.forEach(site => {
                        visitedMap[site.key] = true
                        if (allSitesMap[site.key] && site.enable) {
                            rs.push(allSitesMap[site.key])
                        }
                    })
                    // 如果有新的站源 则追加到后面 默认启用
                    allSites.forEach(site => {
                        if (!visitedMap[site.key]) {
                            rs.push(site)
                        }
                    })
                    config.video.sites = rs
                    config.video.danmuSearchUrl = `http://127.0.0.1:${_request.server.address().port}/website/danmu/fe`

                    reply.send(config);
                }
            );
            fastify.get('/full-config', (_, reply) => {
                const config = getConfig()
                reply.send(config);
            })
        }
    );

    fastify.get('/danmu-proxy', async (request, reply) => {
        try {
            const {name, episodeNumber} = request.query
            const danmuSetting = await getDanmuSetting(request.server)
            let matched = false
            let count = 0
            const danmuUrl = await new Promise(resolve => {
                for(const url of danmuSetting.urls) {
                    axios.get(`${url.address}/api/v2/search/episodes`, {
                        params: {
                            anime: name
                        }
                    })
                      .then(async res => {
                          console.log('searchResult', name, res.data)
                          const anime = res.data.animes[0]
                          const episode = anime.episodes.find(item => findEpisodeNumber(item.episodeTitle) === episodeNumber) || anime.episodes[0]
                          if (!matched) {
                              matched = true
                              messageToDart({
                                  action: 'toast',
                                  opt: {
                                      message: `匹配弹幕：${anime.animeTitle} ${episode.episodeTitle}`,
                                      duration: 3
                                  }
                              })
                              resolve(`${url.address}/api/v2/comment/${episode.episodeId}?format=xml`)
                          }
                      })
                      .finally(() => {
                          count++
                          if (count === danmuSetting.urls.length && !matched) {
                              resolve()
                          }
                      })
                }
            })
            if (danmuUrl) {
                const response = await axios.get(danmuUrl, { responseType: 'text' });
                reply.header('Content-Type', 'application/xml');
                reply.send(response.data);
            } else {
                messageToDart({
                    action: 'toast',
                    opt: {
                        message: '没有匹配的弹幕，请手动推送',
                        duration: 3
                    }
                })
                reply.header('Content-Type', 'application/xml');
                reply.send('<?xml version="1.0" encoding="UTF-8"?><i/>');
            }
        } catch (e) {
            console.error('Danmu proxy error:', e);
            reply.code(500).send({ error: 'Failed to fetch danmu content' });
        }
    });

    // 注册统一的钩子
    fastify.addHook('onSend', async (request, reply, payload) => {
        try {
            // 这里做弹幕自动推送
            const danmuSetting = await getDanmuSetting(request.server)
            if (danmuSetting.autoPush) {
                if (request.url.endsWith('/detail')) {
                    // 调用detail接口时先把剧集信息存下来
                    const data = JSON.parse(payload)
                    const vodInfo = data.list[0]
                    danmuInfo = {}
                    const lines = vodInfo.vod_play_from.split('$$$') || []
                    vodInfo.vod_play_url.split('$$$').filter(Boolean).forEach((vods, lineIndex) => {
                        vods.split('#').forEach((vod) => {
                            const [name, id] = vod.split('$')

                            danmuInfo[`${lines[lineIndex]}_${id}`] = {
                                name: extractTitle(vodInfo.vod_name),
                                episodeNumber: findEpisodeNumber(name)
                            };
                        })
                    })
                    console.log('danmuInfo', danmuInfo)
                }
                if (request.url.endsWith('/play')) {
                    const data = JSON.parse(payload)
                    if ((data.url || data.url?.length || data.urls?.length) && !data?.extra?.danmaku) {
                        const key = `${request.body.flag}_${request.body.id}`
                        let episodeInfo = danmuInfo[key]
                        if (episodeInfo && !episodeInfo?.name) {
                            const playInfo = await messageToDart({
                                action: 'getPlayInfo',
                            })
                            if (playInfo) {
                                console.log('playInfo', playInfo)
                                episodeInfo.name = playInfo?.title
                            }
                        }
                        if (episodeInfo) {
                            if (!data.extra) {
                                data.extra = {}
                            }
                            data.extra.danmaku = `http://127.0.0.1:${request.server.address().port}/danmu-proxy?name=${encodeURIComponent(episodeInfo.name)}&episodeNumber=${encodeURIComponent(episodeInfo.episodeNumber)}`
                            return JSON.stringify(data)
                        } else {
                            messageToDart({
                                action: 'toast',
                                opt: {
                                    message: '没有匹配的弹幕，请手动推送',
                                    duration: 3
                                }
                            })
                        }
                    }
                }
            }
        } catch (err) {
            console.error(err)
        }
        return payload
    })
}
